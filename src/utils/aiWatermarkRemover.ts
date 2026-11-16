// ============================================================
// Gemini Watermark Remover — True AI LaMa ONNX Inpainting (v2.0.0)
//
// Pipeline:
// 1. Bottom-Right 512x512 Local Crop & 5px-Dilated Star Mask
// 2. Client-Side LaMa ONNX Inference via onnxruntime-web + jsDelivr WASM
// 3. Browser CacheStorage for 0-Latency Subsequent Inferences
// 4. Seamless 6px Feathered Border Composite Back onto Full Canvas
// 5. Zero-Fail Fallback to Reverse Alpha Mathematical Un-Blending
// ============================================================

export type CoveragePreset = 'compact' | 'default' | 'large' | 'wide';

export interface InpaintResult {
  fullCanvas: HTMLCanvasElement;
  patchBeforeCanvas: HTMLCanvasElement;
  patchAfterCanvas: HTMLCanvasElement;
  engineUsed: 'lama-onnx' | 'reverse-alpha-unblend' | 'texture-synthesis';
  executionTimeMs: number;
}

export interface ModelLoadProgress {
  status: 'idle' | 'checking-cache' | 'downloading' | 'compiling' | 'ready' | 'fallback';
  progress: number;
  message: string;
}

export const LAMA_MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
export const MODEL_CACHE_NAME = 'lama-onnx-v2';

let cachedSession: any = null;

/**
 * Loads onnxruntime-web dynamically via official jsDelivr CDN script tag.
 * Bypasses Next.js / Webpack / Terser 'import.meta' bundling errors while
 * keeping client-side bundle light and WASM paths guaranteed to work on Vercel.
 */
export async function getOrt(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).ort) return (window as any).ort;

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('ort-web-script') as HTMLScriptElement;
    if (existing) {
      if ((window as any).ort) return resolve((window as any).ort);
      existing.addEventListener('load', () => resolve((window as any).ort));
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'ort-web-script';
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const ort = (window as any).ort;
      if (ort) {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        ort.env.wasm.numThreads = 1;
        resolve(ort);
      } else {
        reject(new Error('window.ort not found after script load'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load onnxruntime-web script from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Checks if the LaMa ONNX model is already cached in browser CacheStorage
 */
export async function isModelCached(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const match = await cache.match(LAMA_MODEL_URL);
    return !!match;
  } catch {
    return false;
  }
}

/**
 * Loads the LaMa ONNX model via CacheStorage and creates an InferenceSession
 */
export async function getLamaSession(
  onProgress?: (info: ModelLoadProgress) => void
): Promise<any> {
  if (cachedSession) return cachedSession;
  if (typeof window === 'undefined') return null;

  onProgress?.({
    status: 'checking-cache',
    progress: 5,
    message: 'Đang kiểm tra AI model...',
  });

  const ort = await getOrt();
  if (!ort) throw new Error('Could not initialize ONNX Runtime Web');

  let modelBuffer: ArrayBuffer | null = null;

  if ('caches' in window) {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME);
      const cached = await cache.match(LAMA_MODEL_URL);
      if (cached) {
        onProgress?.({
          status: 'ready',
          progress: 50,
          message: 'Tải AI model từ bộ nhớ đệm...',
        });
        modelBuffer = await cached.arrayBuffer();
      } else {
        onProgress?.({
          status: 'downloading',
          progress: 10,
          message: 'Đang tải AI LaMa model (~200MB)...',
        });
        const resp = await fetch(LAMA_MODEL_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const contentLength = resp.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (total && resp.body) {
          const reader = resp.body.getReader();
          let loaded = 0;
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              const pct = Math.round(10 + (loaded / total) * 75);
              onProgress?.({
                status: 'downloading',
                progress: pct,
                message: `Đang tải AI model: ${Math.round(loaded / (1024 * 1024))}MB / ${Math.round(total / (1024 * 1024))}MB (${pct}%)`,
              });
            }
          }
          const fullArray = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) {
            fullArray.set(chunk, offset);
            offset += chunk.length;
          }
          modelBuffer = fullArray.buffer;

          try {
            await cache.put(
              LAMA_MODEL_URL,
              new Response(fullArray, {
                headers: { 'Content-Type': 'application/octet-stream' },
              })
            );
          } catch (cErr) {
            console.warn('Cache put failed:', cErr);
          }
        } else {
          const buf = await resp.arrayBuffer();
          modelBuffer = buf;
          try {
            await cache.put(
              LAMA_MODEL_URL,
              new Response(buf, {
                headers: { 'Content-Type': 'application/octet-stream' },
              })
            );
          } catch {}
        }
      }
    } catch (err) {
      console.warn('CacheStorage access error, falling back to direct fetch:', err);
    }
  }

  if (!modelBuffer) {
    onProgress?.({
      status: 'downloading',
      progress: 30,
      message: 'Đang tải AI LaMa model...',
    });
    const resp = await fetch(LAMA_MODEL_URL);
    if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status}`);
    modelBuffer = await resp.arrayBuffer();
  }

  onProgress?.({
    status: 'compiling',
    progress: 90,
    message: 'Khởi tạo WebAssembly Neural Engine...',
  });

  const session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: ['wasm'],
  });

  cachedSession = session;
  onProgress?.({
    status: 'ready',
    progress: 100,
    message: 'AI Model sẵn sàng!',
  });

  return session;
}

/**
 * Calculates bottom-right crop patch coordinates and dimensions
 * for preview and inspect purposes.
 */
export function getBottomRightPatchInfo(imgWidth: number, imgHeight: number) {
  const margin = Math.round(Math.max(24, Math.min(imgWidth, imgHeight) * 0.032));
  const size = Math.round(Math.max(44, Math.min(imgWidth, imgHeight) * 0.055));
  const patchSize = Math.min(512, Math.max(160, size + margin * 2 + 32));
  const x = Math.max(0, imgWidth - patchSize);
  const y = Math.max(0, imgHeight - patchSize);
  return { x, y, size: patchSize };
}

/**
 * Stage 1 & Stage 2 Reverse Alpha Un-blending and Clean Texture Clone
 */
export function reverseAlphaRestore(
  imgData: ImageData,
  width: number,
  height: number,
  coverage: CoveragePreset = 'default'
): { boxX: number; boxY: number; size: number; unblendedCount: number; clonedCount: number } {
  const data = imgData.data;

  // 1. Locate Exact Watermark Anchor
  let sizeScale = 0.055;
  if (coverage === 'compact') sizeScale = 0.045;
  else if (coverage === 'large') sizeScale = 0.070;
  else if (coverage === 'wide') sizeScale = 0.088;

  const minDim = Math.min(width, height);
  // Increase boxSize by +25% toward the top-left
  const rawSize = Math.round(Math.max(52, minDim * sizeScale * 1.25));

  // Extend box all the way to width - 4 and height - 4
  const boxEndX = Math.min(width, width - 4);
  const boxEndY = Math.min(height, height - 4);

  let boxX = Math.max(0, boxEndX - rawSize);
  let boxY = Math.max(0, boxEndY - rawSize);

  // Scan local corner region to locate exact brightness peak of the star center
  const searchMinX = Math.max(0, width - Math.round(rawSize * 1.35));
  const searchMaxX = width - Math.max(4, Math.round(width * 0.005));
  const searchMinY = Math.max(0, height - Math.round(rawSize * 1.35));
  const searchMaxY = height - Math.max(4, Math.round(height * 0.005));

  let peakLuma = -1;
  let peakX = boxX + Math.round(rawSize / 2);
  let peakY = boxY + Math.round(rawSize / 2);

  for (let y = searchMinY; y < searchMaxY; y++) {
    const row = y * width;
    for (let x = searchMinX; x < searchMaxX; x++) {
      const idx = (row + x) * 4;
      const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (l > peakLuma) {
        peakLuma = l;
        peakX = x;
        peakY = y;
      }
    }
  }

  // Ensure box covers the star center while extending to width - 4, height - 4
  if (peakLuma > 175) {
    const desiredMinX = Math.max(0, peakX - Math.round(rawSize * 0.55));
    const desiredMinY = Math.max(0, peakY - Math.round(rawSize * 0.55));
    boxX = Math.min(boxX, desiredMinX);
    boxY = Math.min(boxY, desiredMinY);
  }

  const size = Math.min(boxEndX - boxX, boxEndY - boxY);
  boxX = boxEndX - size;
  boxY = boxEndY - size;

  // 2. Compute local background luminance (bgLuma) from the clean 8px border framing that square
  const borderWidth = 8;
  let bgLumaSum = 0;
  let bgLumaCount = 0;

  const borderTopLuma = new Float32Array(size);
  const borderLeftLuma = new Float32Array(size);

  for (let px = 0; px < size; px++) {
    const x = boxX + px;
    let colSum = 0;
    for (let dy = 1; dy <= borderWidth; dy++) {
      const y = Math.max(0, boxY - dy);
      const idx = (y * width + x) * 4;
      const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      colSum += l;
      bgLumaSum += l;
      bgLumaCount++;
    }
    borderTopLuma[px] = colSum / borderWidth;
  }

  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    let rowSum = 0;
    for (let dx = 1; dx <= borderWidth; dx++) {
      const x = Math.max(0, boxX - dx);
      const idx = (y * width + x) * 4;
      const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      rowSum += l;
      bgLumaSum += l;
      bgLumaCount++;
    }
    borderLeftLuma[py] = rowSum / borderWidth;
  }

  const borderAvgLuma = bgLumaCount > 0 ? bgLumaSum / bgLumaCount : 128;

  // 3. Measure brightness excess & estimate alpha transparency strictly per-pixel (threshold delta > 5)
  // NOTE (v1.3.2): No dilation on alpha map to prevent over-darkening clean background pixels along outer edge.
  const alphaMap = new Float32Array(size * size);

  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    const row = y * width;
    for (let px = 0; px < size; px++) {
      const x = boxX + px;
      const idx = (row + x) * 4;
      const pixelLuma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      const localBg = 0.5 * borderTopLuma[px] + 0.5 * borderLeftLuma[py];
      const effectiveBg =
        localBg > 0 && Math.abs(localBg - borderAvgLuma) < 55 ? localBg : borderAvgLuma;
      const delta = pixelLuma - effectiveBg;
      const deltaDenom = Math.max(15, 255 - effectiveBg);

      if (delta > 5) {
        // Smooth linear ramp starting strictly at delta > 5
        const ramp = Math.min(1.0, (delta - 5) / 5.0);
        const rawAlpha = ((delta - 4) / deltaDenom) * 1.15 * ramp;
        alphaMap[py * size + px] = Math.max(0, Math.min(0.85, rawAlpha));
      } else {
        alphaMap[py * size + px] = 0;
      }
    }
  }

  // 4. Stage 1: Reverse Alpha Un-blending + Stage 2: Saturated Highlights Clone
  // Applied strictly per-pixel where alpha > 0.01 — untouched background pixels (delta <= 5) are NEVER darkened.
  let unblendedCount = 0;
  let clonedCount = 0;

  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    const row = y * width;
    for (let px = 0; px < size; px++) {
      const x = boxX + px;
      const alpha = alphaMap[py * size + px];
      if (alpha <= 0.01) continue;

      const idx = (row + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const pixelLuma = 0.299 * r + 0.587 * g + 0.114 * b;

      // Stage 2: Near-saturated pixels (luma > 248) -> Offset clone stamp
      if (pixelLuma > 248 && alpha > 0.65) {
        const srcX = Math.max(0, x - size - 12);
        const srcY = y;
        const srcIdx = (srcY * width + srcX) * 4;

        data[idx] = data[srcIdx];
        data[idx + 1] = data[srcIdx + 1];
        data[idx + 2] = data[srcIdx + 2];
        clonedCount++;
      } else {
        // Stage 1: Invert alpha blend on each RGB channel
        const invAlpha = 1.0 - alpha;
        const cleanR = Math.max(0, Math.min(255, (r - alpha * 255) / invAlpha));
        const cleanG = Math.max(0, Math.min(255, (g - alpha * 255) / invAlpha));
        const cleanB = Math.max(0, Math.min(255, (b - alpha * 255) / invAlpha));

        data[idx] = Math.round(cleanR);
        data[idx + 1] = Math.round(cleanG);
        data[idx + 2] = Math.round(cleanB);
        unblendedCount++;
      }
    }
  }

  // 5. Stage 3: Boundary Luminance Offset Calibration (v1.3.3)
  // Compare inner boundary ring (alpha > 0.02, near edge) against outer boundary ring (alpha <= 0.01, clean background)
  // to compensate for JPEG compression ringing and eliminate any faint 2-4% luminance ghost.
  let outerSumR = 0,
    outerSumG = 0,
    outerSumB = 0,
    outerCount = 0;
  let innerSumR = 0,
    innerSumG = 0,
    innerSumB = 0,
    innerCount = 0;

  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    for (let px = 0; px < size; px++) {
      const x = boxX + px;
      const alpha = alphaMap[py * size + px];
      const idx = (y * width + x) * 4;

      if (alpha > 0.02) {
        // Inner boundary pixel: inside watermark, but within 2px of clean background
        let nearClean = false;
        for (let dy = -2; dy <= 2 && !nearClean; dy++) {
          const ny = py + dy;
          for (let dx = -2; dx <= 2 && !nearClean; dx++) {
            if (dx * dx + dy * dy > 4.5) continue;
            const nx = px + dx;
            if (nx < 0 || nx >= size || ny < 0 || ny >= size || alphaMap[ny * size + nx] <= 0.01) {
              nearClean = true;
            }
          }
        }
        if (nearClean) {
          innerSumR += data[idx];
          innerSumG += data[idx + 1];
          innerSumB += data[idx + 2];
          innerCount++;
        }
      } else {
        // Outer boundary pixel: clean background, within 2.5px of watermark perimeter
        let nearStar = false;
        for (let dy = -2; dy <= 2 && !nearStar; dy++) {
          const ny = py + dy;
          if (ny < 0 || ny >= size) continue;
          for (let dx = -2; dx <= 2 && !nearStar; dx++) {
            if (dx * dx + dy * dy > 5.5) continue;
            const nx = px + dx;
            if (nx >= 0 && nx < size && alphaMap[ny * size + nx] > 0.02) {
              nearStar = true;
            }
          }
        }
        if (nearStar) {
          outerSumR += data[idx];
          outerSumG += data[idx + 1];
          outerSumB += data[idx + 2];
          outerCount++;
        }
      }
    }
  }

  if (outerCount > 0 && innerCount > 0) {
    const avgOuterR = outerSumR / outerCount;
    const avgOuterG = outerSumG / outerCount;
    const avgOuterB = outerSumB / outerCount;

    const avgInnerR = innerSumR / innerCount;
    const avgInnerG = innerSumG / innerCount;
    const avgInnerB = innerSumB / innerCount;

    // Residual luminance offset (clamped to [-18, 18] for subtle 2-4% calibration)
    const offsetR = Math.max(-18, Math.min(18, avgOuterR - avgInnerR));
    const offsetG = Math.max(-18, Math.min(18, avgOuterG - avgInnerG));
    const offsetB = Math.max(-18, Math.min(18, avgOuterB - avgInnerB));

    // Apply smooth corrective offset weighted by normalized alpha
    for (let py = 0; py < size; py++) {
      const y = boxY + py;
      const row = y * width;
      for (let px = 0; px < size; px++) {
        const alpha = alphaMap[py * size + px];
        if (alpha <= 0.01) continue;

        const idx = (row + (boxX + px)) * 4;
        const normAlpha = Math.min(1.0, alpha / 0.45);

        data[idx] = Math.max(0, Math.min(255, Math.round(data[idx] + offsetR * normAlpha)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(data[idx + 1] + offsetG * normAlpha)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(data[idx + 2] + offsetB * normAlpha)));
      }
    }
  }

  // 6. Stage 4: Micro-Grain Matching (v1.3.3)
  // Subtle zero-mean sensor noise (±1.5 RGB variance) to restore natural floor tile grain
  // and dither away any JPEG compression quantization artifacts inside the star.
  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    const row = y * width;
    for (let px = 0; px < size; px++) {
      const alpha = alphaMap[py * size + px];
      if (alpha <= 0.02) continue;

      const idx = (row + (boxX + px)) * 4;
      const grain = (Math.random() - 0.5) * 3.0; // Zero-mean ±1.5 variance
      data[idx] = Math.max(0, Math.min(255, Math.round(data[idx] + grain)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(data[idx + 1] + grain)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(data[idx + 2] + grain)));
    }
  }

  // 7. Stage 5: 2px Seam Ring Interpolation (v1.3.2/v1.3.3)
  // Detect the narrow 2px-wide transition ring right along the boundary where alpha > 0 meets alpha === 0.
  // Replace only those 2px boundary ring pixels by smoothly interpolating from clean unmasked pixels
  // (alpha === 0) immediately adjacent to them within a 3px radius, erasing the hairline edge seam
  // without touching the crisp interior texture.
  const ringBuffer = new Uint8ClampedArray(size * size * 4);
  const inRing = new Uint8Array(size * size);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const alpha = alphaMap[py * size + px];
      if (alpha <= 0.01) continue; // Clean background pixel, skip

      // Check minimum Euclidean distance to a clean unmasked pixel (alpha === 0 or outside box)
      let minDistSq = 999;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = py + dy;
        for (let dx = -2; dx <= 2; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > 4.5) continue; // within 2px (Euclidean dist <= 2.12px)
          const nx = px + dx;
          const isClean =
            nx < 0 || nx >= size || ny < 0 || ny >= size || alphaMap[ny * size + nx] <= 0.01;
          if (isClean && d2 < minDistSq) {
            minDistSq = d2;
          }
        }
      }

      if (minDistSq <= 4.5) {
        // Pixel is in the 2px boundary transition ring
        inRing[py * size + px] = 1;
        const minDist = Math.sqrt(minDistSq);

        // Interpolate from clean unmasked pixels (alpha === 0) within a 3px radius
        let sumR = 0,
          sumG = 0,
          sumB = 0,
          totalW = 0;

        for (let dy = -3; dy <= 3; dy++) {
          const ny = py + dy;
          const gy = boxY + ny;
          if (gy < 0 || gy >= height) continue;

          for (let dx = -3; dx <= 3; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 > 9.5) continue; // within 3px radius (dist <= 3.08px)
            const nx = px + dx;
            const gx = boxX + nx;
            if (gx < 0 || gx >= width) continue;

            const isClean =
              nx < 0 || nx >= size || ny < 0 || ny >= size || alphaMap[ny * size + nx] <= 0.01;
            if (!isClean) continue;

            const dist = Math.sqrt(d2);
            const w = 1.0 / dist;
            const cIdx = (gy * width + gx) * 4;
            sumR += data[cIdx] * w;
            sumG += data[cIdx + 1] * w;
            sumB += data[cIdx + 2] * w;
            totalW += w;
          }
        }

        const bOffset = (py * size + px) * 4;
        if (totalW > 0) {
          const interpR = sumR / totalW;
          const interpG = sumG / totalW;
          const interpB = sumB / totalW;

          // Seamless transition: pixels directly at boundary (dist <= 1.2px) take 100% interpolated,
          // inner ring pixels (1.2px < dist <= 2.12px) blend smoothly with unblended interior.
          const interpWeight = minDist <= 1.2 ? 1.0 : Math.max(0.4, 1.0 - (minDist - 1.2) * 0.6);
          const unblendWeight = 1.0 - interpWeight;

          const curIdx = ((boxY + py) * width + (boxX + px)) * 4;
          ringBuffer[bOffset] = Math.round(interpR * interpWeight + data[curIdx] * unblendWeight);
          ringBuffer[bOffset + 1] = Math.round(interpG * interpWeight + data[curIdx + 1] * unblendWeight);
          ringBuffer[bOffset + 2] = Math.round(interpB * interpWeight + data[curIdx + 2] * unblendWeight);
        } else {
          const curIdx = ((boxY + py) * width + (boxX + px)) * 4;
          ringBuffer[bOffset] = data[curIdx];
          ringBuffer[bOffset + 1] = data[curIdx + 1];
          ringBuffer[bOffset + 2] = data[curIdx + 2];
        }
      }
    }
  }

  // Write ring buffer back to image data
  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    const row = y * width;
    for (let px = 0; px < size; px++) {
      if (inRing[py * size + px] === 1) {
        const idx = (row + (boxX + px)) * 4;
        const bOffset = (py * size + px) * 4;
        data[idx] = ringBuffer[bOffset];
        data[idx + 1] = ringBuffer[bOffset + 1];
        data[idx + 2] = ringBuffer[bOffset + 2];
      }
    }
  }

  return { boxX, boxY, size, unblendedCount, clonedCount };
}

/**
 * Runs True AI LaMa Inpainting on the bottom-right corner where the Gemini logo lives.
 * Extracts a proportional crop (scaled to 512x512), builds a 5px-dilated star mask,
 * executes onnxruntime-web inference, and composites the cleaned patch back
 * with a 6px feathered boundary blend.
 */
export async function lamaInpaintBottomRight(
  fullCanvas: HTMLCanvasElement,
  coverage: CoveragePreset = 'default',
  onProgress?: (info: ModelLoadProgress) => void
): Promise<boolean> {
  const origWidth = fullCanvas.width;
  const origHeight = fullCanvas.height;
  const fullCtx = fullCanvas.getContext('2d')!;

  // 1. Calculate bottom-right crop dimensions
  const minDim = Math.min(origWidth, origHeight);
  let sizeScale = 0.055;
  if (coverage === 'compact') sizeScale = 0.045;
  else if (coverage === 'large') sizeScale = 0.070;
  else if (coverage === 'wide') sizeScale = 0.088;

  const rawStarSize = Math.round(Math.max(52, minDim * sizeScale * 1.25));
  const cropSize = Math.min(
    origWidth,
    Math.min(origHeight, Math.max(512, Math.round(rawStarSize * 2.8)))
  );

  const cropX = origWidth - cropSize;
  const cropY = origHeight - cropSize;

  // 2. Extract crop patch scaled to 512x512
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = 512;
  cropCanvas.height = 512;
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true })!;
  cropCtx.drawImage(fullCanvas, cropX, cropY, cropSize, cropSize, 0, 0, 512, 512);

  const cropData = cropCtx.getImageData(0, 0, 512, 512);
  const d = cropData.data;

  // 3. Create high-precision star mask with 5px dilation on 512x512
  const scale = 512 / cropSize;
  const starEndX = 512 - Math.max(2, Math.round(4 * scale));
  const starEndY = 512 - Math.max(2, Math.round(4 * scale));
  const starBoxSize = Math.round(rawStarSize * scale);
  const starStartX = Math.max(0, starEndX - starBoxSize);
  const starStartY = Math.max(0, starEndY - starBoxSize);

  // Compute local background luminance in crop
  let bgLumaSum = 0;
  let bgLumaCount = 0;

  for (let x = starStartX; x < starEndX; x += 2) {
    for (let dy = 2; dy <= 10; dy++) {
      const y = Math.max(0, starStartY - dy);
      const idx = (y * 512 + x) * 4;
      bgLumaSum += 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      bgLumaCount++;
    }
  }
  for (let y = starStartY; y < starEndY; y += 2) {
    for (let dx = 2; dx <= 10; dx++) {
      const x = Math.max(0, starStartX - dx);
      const idx = (y * 512 + x) * 4;
      bgLumaSum += 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      bgLumaCount++;
    }
  }
  const avgBg = bgLumaCount > 0 ? bgLumaSum / bgLumaCount : 128;

  // Initial binary star mask (255 = inpaint, 0 = keep)
  const initialMask = new Uint8Array(512 * 512);
  for (let y = starStartY; y < starEndY; y++) {
    for (let x = starStartX; x < starEndX; x++) {
      const idx = (y * 512 + x) * 4;
      const luma = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
      if (luma - avgBg > 4) {
        initialMask[y * 512 + x] = 255;
      }
    }
  }

  // 5px morphological dilation so all surrounding JPEG compression blocks are fully covered
  const dilatedMask = new Uint8Array(512 * 512);
  const dilateRadius = 5;
  for (let y = starStartY - dilateRadius; y < Math.min(512, starEndY + dilateRadius); y++) {
    if (y < 0) continue;
    for (let x = starStartX - dilateRadius; x < Math.min(512, starEndX + dilateRadius); x++) {
      if (x < 0) continue;

      let hit = false;
      for (let dy = -dilateRadius; dy <= dilateRadius && !hit; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= 512) continue;
        for (let dx = -dilateRadius; dx <= dilateRadius && !hit; dx++) {
          if (dx * dx + dy * dy > 25.0) continue; // 5px radius
          const nx = x + dx;
          if (nx < 0 || nx >= 512) continue;
          if (initialMask[ny * 512 + nx] === 255) {
            hit = true;
          }
        }
      }
      if (hit) {
        dilatedMask[y * 512 + x] = 255;
      }
    }
  }

  // 4. Load or retrieve LaMa ONNX session
  const session = await getLamaSession(onProgress);
  if (!session) return false;

  onProgress?.({
    status: 'ready',
    progress: 95,
    message: 'AI LaMa đang vẽ lại chi tiết gốc...',
  });

  const ort = await getOrt();

  // 5. Prepare input tensors [1, 3, 512, 512] for image and [1, 1, 512, 512] for mask
  const chSize = 512 * 512;
  const imgTensorData = new Float32Array(1 * 3 * 512 * 512);
  const maskTensorData = new Float32Array(1 * 1 * 512 * 512);

  for (let i = 0; i < chSize; i++) {
    imgTensorData[i] = d[i * 4] / 255.0; // R
    imgTensorData[chSize + i] = d[i * 4 + 1] / 255.0; // G
    imgTensorData[chSize * 2 + i] = d[i * 4 + 2] / 255.0; // B

    maskTensorData[i] = dilatedMask[i] > 128 ? 1.0 : 0.0;
  }

  const imageTensor = new ort.Tensor('float32', imgTensorData, [1, 3, 512, 512]);
  const maskTensor = new ort.Tensor('float32', maskTensorData, [1, 1, 512, 512]);

  // 6. Run Inference
  const feeds = { image: imageTensor, mask: maskTensor };
  const results = await session.run(feeds);
  const outputTensor =
    results[session.outputNames[0]] || results['output'] || Object.values(results)[0];

  if (!outputTensor || !outputTensor.data) return false;

  const outData = outputTensor.data as Float32Array;
  const cleanedCropData = cropCtx.createImageData(512, 512);

  for (let i = 0; i < chSize; i++) {
    let r = outData[i];
    let g = outData[chSize + i];
    let b = outData[chSize * 2 + i];

    if (r <= 1.0 && g <= 1.0 && b <= 1.0) {
      r *= 255;
      g *= 255;
      b *= 255;
    }

    cleanedCropData.data[i * 4] = Math.max(0, Math.min(255, Math.round(r)));
    cleanedCropData.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
    cleanedCropData.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
    cleanedCropData.data[i * 4 + 3] = 255;
  }

  cropCtx.putImageData(cleanedCropData, 0, 0);

  // 7. Scale back if cropSize !== 512
  let patchCanvas: HTMLCanvasElement = cropCanvas;
  if (cropSize !== 512) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = cropSize;
    scaledCanvas.height = cropSize;
    const sCtx = scaledCanvas.getContext('2d')!;
    sCtx.drawImage(cropCanvas, 0, 0, 512, 512, 0, 0, cropSize, cropSize);
    patchCanvas = scaledCanvas;
  }

  // 8. Composite cleaned patch back onto full-resolution canvas with 6px feathered blend at borders
  const fullData = fullCtx.getImageData(0, 0, origWidth, origHeight);
  const patchData = patchCanvas.getContext('2d')!.getImageData(0, 0, cropSize, cropSize);
  const feather = 6;

  for (let py = 0; py < cropSize; py++) {
    const gy = cropY + py;
    if (gy < 0 || gy >= origHeight) continue;

    for (let px = 0; px < cropSize; px++) {
      const gx = cropX + px;
      if (gx < 0 || gx >= origWidth) continue;

      let weight = 1.0;
      if (px < feather) weight = Math.min(weight, px / feather);
      if (py < feather) weight = Math.min(weight, py / feather);

      const pIdx = (py * cropSize + px) * 4;
      const fIdx = (gy * origWidth + gx) * 4;

      if (weight >= 1.0) {
        fullData.data[fIdx] = patchData.data[pIdx];
        fullData.data[fIdx + 1] = patchData.data[pIdx + 1];
        fullData.data[fIdx + 2] = patchData.data[pIdx + 2];
      } else {
        fullData.data[fIdx] = Math.round(
          patchData.data[pIdx] * weight + fullData.data[fIdx] * (1.0 - weight)
        );
        fullData.data[fIdx + 1] = Math.round(
          patchData.data[pIdx] * weight + fullData.data[fIdx + 1] * (1.0 - weight)
        );
        fullData.data[fIdx + 2] = Math.round(
          patchData.data[pIdx] * weight + fullData.data[fIdx + 2] * (1.0 - weight)
        );
      }
    }
  }

  fullCtx.putImageData(fullData, 0, 0);
  return true;
}

/**
 * Backward compatibility alias for watermarkRemover
 */
export function criminisiInpaint(
  imgData: ImageData,
  mask: Uint8Array,
  width: number,
  height: number,
  patchRadius = 3,
  searchRadius = 65,
  exclusionZone?: { minX: number; minY: number }
): void {
  reverseAlphaRestore(imgData, width, height, 'default');
}

/**
 * Main 1-Click AI Watermark Removal Pipeline (v2.0.0):
 * Primary engine: True LaMa ONNX AI Inpainting via browser WebAssembly.
 * Fallback engine: Deterministic Reverse Alpha Un-Blending.
 */
export async function removeGeminiWatermarkAuto(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  coverage: CoveragePreset = 'default',
  preferNeural = true,
  onProgress?: (info: ModelLoadProgress) => void
): Promise<InpaintResult> {
  const startTime = performance.now();

  const origWidth =
    sourceImage instanceof HTMLImageElement ? sourceImage.naturalWidth : sourceImage.width;
  const origHeight =
    sourceImage instanceof HTMLImageElement ? sourceImage.naturalHeight : sourceImage.height;

  // 1. Create full-resolution canvas
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = origWidth;
  fullCanvas.height = origHeight;
  const fullCtx = fullCanvas.getContext('2d')!;
  fullCtx.drawImage(sourceImage, 0, 0, origWidth, origHeight);

  // 2. Patch before canvas (for inspection)
  const { x: patchX, y: patchY, size: patchSize } = getBottomRightPatchInfo(origWidth, origHeight);
  const patchBeforeCanvas = document.createElement('canvas');
  patchBeforeCanvas.width = patchSize;
  patchBeforeCanvas.height = patchSize;
  const pBeforeCtx = patchBeforeCanvas.getContext('2d')!;
  pBeforeCtx.drawImage(
    sourceImage,
    patchX,
    patchY,
    patchSize,
    patchSize,
    0,
    0,
    patchSize,
    patchSize
  );

  let engineUsed: 'lama-onnx' | 'reverse-alpha-unblend' = 'reverse-alpha-unblend';

  // Primary: Try True LaMa ONNX AI Inpainting
  if (preferNeural) {
    try {
      const lamaSuccess = await lamaInpaintBottomRight(fullCanvas, coverage, onProgress);
      if (lamaSuccess) {
        engineUsed = 'lama-onnx';
      }
    } catch (lamaErr) {
      console.warn('LaMa ONNX inference failed, falling back to reverse-alpha unblend:', lamaErr);
    }
  }

  // Fallback: If LaMa was skipped or encountered an error, run reverseAlphaRestore
  if (engineUsed !== 'lama-onnx') {
    onProgress?.({
      status: 'fallback',
      progress: 90,
      message: 'Đang phục hồi pixel chính xác...',
    });
    const imgData = fullCtx.getImageData(0, 0, origWidth, origHeight);
    reverseAlphaRestore(imgData, origWidth, origHeight, coverage);
    fullCtx.putImageData(imgData, 0, 0);
  }

  // 4. Patch after canvas
  const patchAfterCanvas = document.createElement('canvas');
  patchAfterCanvas.width = patchSize;
  patchAfterCanvas.height = patchSize;
  const pAfterCtx = patchAfterCanvas.getContext('2d')!;
  pAfterCtx.drawImage(
    fullCanvas,
    patchX,
    patchY,
    patchSize,
    patchSize,
    0,
    0,
    patchSize,
    patchSize
  );

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    fullCanvas,
    patchBeforeCanvas,
    patchAfterCanvas,
    engineUsed: engineUsed as any,
    executionTimeMs,
  };
}
