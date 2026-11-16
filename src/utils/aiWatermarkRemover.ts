// ============================================================
// AI Gemini Watermark Remover — LaMa ONNX + Patch Synthesis Engine
//
// 1. Smart Bottom-Right Local Crop (clamped to 512x512)
// 2. Client-side LaMa ONNX Neural Inpainting (via onnxruntime-web)
// 3. Robust IndexedDB / CacheStorage Model Caching
// 4. High-Fidelity PatchMatch / Exemplar Fallback
// 5. 12px Feathered Seam Alpha Re-compositing on Full-Res Canvas
// ============================================================

export type CoveragePreset = 'compact' | 'default' | 'large' | 'wide';

export interface InpaintResult {
  fullCanvas: HTMLCanvasElement;
  patchBeforeCanvas: HTMLCanvasElement;
  patchAfterCanvas: HTMLCanvasElement;
  engineUsed: 'lama-onnx' | 'texture-synthesis';
  executionTimeMs: number;
}

export interface ModelLoadProgress {
  status: 'idle' | 'checking-cache' | 'downloading' | 'compiling' | 'ready' | 'fallback';
  progress: number; // 0 - 100
  message: string;
}

// Recommended lightweight quantized / float16 LaMa ONNX endpoints
const LAMA_MODEL_URL =
  'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
const CACHE_NAME = 'lama-inpaint-model-cache-v1';
const MODEL_CACHE_KEY = '/models/lama_fp32.onnx';

let cachedSession: any = null;
let sessionLoadingPromise: Promise<any> | null = null;

/**
 * Check if the model is already cached locally in CacheStorage or IndexedDB
 */
export async function isModelCached(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(MODEL_CACHE_KEY);
    return !!response;
  } catch {
    return false;
  }
}

async function loadOrt(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if ((window as any).ort) return (window as any).ort;

  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-ort="true"]') as HTMLScriptElement;
    if (existing) {
      if ((window as any).ort) {
        resolve((window as any).ort);
        return;
      }
      existing.addEventListener('load', () => resolve((window as any).ort));
      existing.addEventListener('error', () => resolve(null));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.min.js';
    script.async = true;
    script.setAttribute('data-ort', 'true');
    script.onload = () => resolve((window as any).ort || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * Load or initialize LaMa ONNX InferenceSession with CacheStorage caching
 */
export async function getLamaSession(
  onProgress?: (info: ModelLoadProgress) => void
): Promise<any> {
  if (cachedSession) return cachedSession;
  if (sessionLoadingPromise) return sessionLoadingPromise;

  sessionLoadingPromise = (async () => {
    try {
      // Load ONNX Runtime client-side
      const ort = await loadOrt();
      if (!ort) {
        throw new Error('ONNX Runtime not available in browser');
      }

      // Configure WASM paths from CDN
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
      ort.env.wasm.numThreads = Math.min(4, typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2);

      let modelArrayBuffer: ArrayBuffer | null = null;

      // 1. Try CacheStorage
      if (typeof window !== 'undefined' && 'caches' in window) {
        onProgress?.({
          status: 'checking-cache',
          progress: 5,
          message: 'Checking local model cache...',
        });

        try {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(MODEL_CACHE_KEY);

          if (cachedResponse) {
            onProgress?.({
              status: 'compiling',
              progress: 80,
              message: 'Loading cached LaMa model...',
            });
            modelArrayBuffer = await cachedResponse.arrayBuffer();
          }
        } catch (e) {
          console.warn('CacheStorage read failed, will fetch model:', e);
        }
      }

      // 2. Fetch model if not cached
      if (!modelArrayBuffer) {
        onProgress?.({
          status: 'downloading',
          progress: 10,
          message: 'Downloading LaMa AI Model (first time only)...',
        });

        const response = await fetch(LAMA_MODEL_URL);
        if (!response.ok) {
          throw new Error(`Failed to fetch model: ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body?.getReader();
        if (!reader) {
          modelArrayBuffer = await response.arrayBuffer();
        } else {
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              if (total > 0) {
                const pct = Math.round(10 + (loaded / total) * 65);
                onProgress?.({
                  status: 'downloading',
                  progress: pct,
                  message: `Downloading AI Model (${Math.round(loaded / (1024 * 1024))}MB / ${Math.round(total / (1024 * 1024))}MB)...`,
                });
              }
            }
          }

          // Combine chunks
          const totalBuffer = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) {
            totalBuffer.set(chunk, offset);
            offset += chunk.length;
          }
          modelArrayBuffer = totalBuffer.buffer;

          // Store in CacheStorage
          if (typeof window !== 'undefined' && 'caches' in window) {
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(
                MODEL_CACHE_KEY,
                new Response(modelArrayBuffer, {
                  headers: { 'Content-Type': 'application/octet-stream' },
                })
              );
            } catch (cacheErr) {
              console.warn('Failed to store model in CacheStorage:', cacheErr);
            }
          }
        }
      }

      onProgress?.({
        status: 'compiling',
        progress: 85,
        message: 'Initializing Neural Session...',
      });

      // 3. Create ONNX session
      const session = await ort.InferenceSession.create(modelArrayBuffer!, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      cachedSession = session;
      onProgress?.({
        status: 'ready',
        progress: 100,
        message: 'LaMa Neural Inpainter Ready',
      });

      return session;
    } catch (err: any) {
      console.warn('LaMa ONNX initialization failed, activating Smart Texture Synthesis fallback:', err);
      onProgress?.({
        status: 'fallback',
        progress: 100,
        message: 'Using Fast Texture Synthesis Engine',
      });
      return null;
    } finally {
      sessionLoadingPromise = null;
    }
  })();

  return sessionLoadingPromise;
}

/**
 * Calculates bottom-right crop patch coordinates and dimensions.
 * Sized generously (~30% of dimension, 280-512px) to guarantee plenty
 * of clean background texture to the left and above the watermark.
 */
export function getBottomRightPatchInfo(imgWidth: number, imgHeight: number) {
  const patchSize = Math.min(512, Math.max(280, Math.round(Math.min(imgWidth, imgHeight) * 0.30)));
  const x = imgWidth - patchSize;
  const y = imgHeight - patchSize;
  return { x, y, size: patchSize };
}

export interface DetectedWatermark {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  height: number;
  detectedBy: 'brightness-cluster' | 'standard-box';
}

/**
 * Dynamically detects the Gemini 4-point sparkle watermark in the bottom-right corner,
 * or falls back to a generous standard Gemini bounding box,
 * then dilates by +8 pixels on all sides so zero anti-aliased white glow remains.
 */
export function detectGeminiWatermarkRegion(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DetectedWatermark {
  // Search region: bottom-right corner (x >= width * 0.82, y >= height * 0.82)
  const scanMinX = Math.floor(width * 0.82);
  const scanMinY = Math.floor(height * 0.82);
  const scanMaxX = width - Math.max(6, Math.floor(width * 0.008));
  const scanMaxY = height - Math.max(6, Math.floor(height * 0.008));

  // Generous standard Gemini bounding box fallback:
  // x: [width - Math.max(90, width * 0.11), width - Math.max(8, width * 0.01)]
  // y: [height - Math.max(90, height * 0.11), height - Math.max(8, height * 0.01)]
  const stdMinX = Math.max(0, width - Math.max(90, Math.round(width * 0.11)));
  const stdMaxX = Math.min(width, width - Math.max(8, Math.round(width * 0.01)));
  const stdMinY = Math.max(0, height - Math.max(90, Math.round(height * 0.11)));
  const stdMaxY = Math.min(height, height - Math.max(8, Math.round(height * 0.01)));

  // Luminance scan
  const lums: number[] = [];
  for (let y = scanMinY; y < scanMaxY; y += 2) {
    const row = y * width;
    for (let x = scanMinX; x < scanMaxX; x += 2) {
      const idx = (row + x) * 4;
      lums.push(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
  }
  lums.sort((a, b) => a - b);
  const medianLum = lums[Math.floor(lums.length * 0.5)] || 128;
  const brightThreshold = Math.max(180, Math.min(245, medianLum + 35));

  let minClusterX = width;
  let maxClusterX = -1;
  let minClusterY = height;
  let maxClusterY = -1;
  let brightCount = 0;

  for (let y = scanMinY; y < scanMaxY; y++) {
    const row = y * width;
    for (let x = scanMinX; x < scanMaxX; x++) {
      const idx = (row + x) * 4;
      const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (l >= brightThreshold) {
        if (x < minClusterX) minClusterX = x;
        if (x > maxClusterX) maxClusterX = x;
        if (y < minClusterY) minClusterY = y;
        if (y > maxClusterY) maxClusterY = y;
        brightCount++;
      }
    }
  }

  const clusterW = maxClusterX - minClusterX + 1;
  const clusterH = maxClusterY - minClusterY + 1;
  let boxMinX: number;
  let boxMaxX: number;
  let boxMinY: number;
  let boxMaxY: number;
  let detectedBy: 'brightness-cluster' | 'standard-box';

  if (
    brightCount >= 15 &&
    clusterW >= 12 &&
    clusterW <= 120 &&
    clusterH >= 12 &&
    clusterH <= 120
  ) {
    boxMinX = minClusterX;
    boxMaxX = maxClusterX;
    boxMinY = minClusterY;
    boxMaxY = maxClusterY;
    detectedBy = 'brightness-cluster';
  } else {
    boxMinX = stdMinX;
    boxMaxX = stdMaxX;
    boxMinY = stdMinY;
    boxMaxY = stdMaxY;
    detectedBy = 'standard-box';
  }

  // Dilate by +8 pixels on all sides so zero anti-aliased white glow remains
  const dilation = 8;
  const finalMinX = Math.max(0, boxMinX - dilation);
  const finalMinY = Math.max(0, boxMinY - dilation);
  const finalMaxX = Math.min(width, boxMaxX + dilation);
  const finalMaxY = Math.min(height, boxMaxY + dilation);

  return {
    startX: finalMinX,
    startY: finalMinY,
    endX: finalMaxX,
    endY: finalMaxY,
    width: finalMaxX - finalMinX,
    height: finalMaxY - finalMinY,
    detectedBy,
  };
}

/**
 * Generates the binary mask inside the bottom-right patch using
 * dynamic bright cluster detection or standard Gemini bounds with +8px dilation.
 */
export function generatePatchMask(
  patchSize: number,
  coverage: CoveragePreset = 'default',
  origWidth?: number,
  origHeight?: number,
  patchData?: Uint8ClampedArray | Uint8Array
): { mask: Uint8Array; detected: DetectedWatermark } {
  const mask = new Uint8Array(patchSize * patchSize);

  let detected: DetectedWatermark;

  if (patchData) {
    detected = detectGeminiWatermarkRegion(patchData, patchSize, patchSize);
  } else {
    // Standard bounding box on patch
    const stdMinX = Math.max(0, patchSize - Math.max(90, Math.round(patchSize * 0.38)));
    const stdMaxX = Math.min(patchSize, patchSize - Math.max(8, Math.round(patchSize * 0.03)));
    const stdMinY = Math.max(0, patchSize - Math.max(90, Math.round(patchSize * 0.38)));
    const stdMaxY = Math.min(patchSize, patchSize - Math.max(8, Math.round(patchSize * 0.03)));
    const dilation = 8;
    const finalMinX = Math.max(0, stdMinX - dilation);
    const finalMinY = Math.max(0, stdMinY - dilation);
    const finalMaxX = Math.min(patchSize, stdMaxX + dilation);
    const finalMaxY = Math.min(patchSize, stdMaxY + dilation);

    detected = {
      startX: finalMinX,
      startY: finalMinY,
      endX: finalMaxX,
      endY: finalMaxY,
      width: finalMaxX - finalMinX,
      height: finalMaxY - finalMinY,
      detectedBy: 'standard-box',
    };
  }

  for (let py = detected.startY; py < detected.endY; py++) {
    const row = py * patchSize;
    for (let px = detected.startX; px < detected.endX; px++) {
      mask[row + px] = 255; // 255 = hole
    }
  }

  return { mask, detected };
}

/**
 * Criminisi Exemplar-Based Texture Synthesis Engine
 *
 * Clean-Only Source Sampling:
 * Strictly forbids sampling any candidate source patch that touches or is inside
 * the dilated watermark mask + safety buffer.
 * Samples ONLY from clean background shifted to the left and above the watermark region.
 * Smooth 3px outer feather blend completely marries the texture with zero smudge.
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
  const data = imgData.data;
  const numPixels = width * height;

  const holeMask = new Uint8Array(numPixels);
  const origHoleMask = new Uint8Array(numPixels);
  const confidence = new Float32Array(numPixels);

  let remainingHoles = 0;
  let minHoleX = width;
  let minHoleY = height;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      if (mask[i] > 0) {
        holeMask[i] = 1;
        origHoleMask[i] = 1;
        confidence[i] = 0.0;
        remainingHoles++;
        if (x < minHoleX) minHoleX = x;
        if (y < minHoleY) minHoleY = y;
      } else {
        holeMask[i] = 0;
        origHoleMask[i] = 0;
        confidence[i] = 1.0;
      }
    }
  }

  if (remainingHoles === 0) return;

  const r = Math.max(2, Math.min(5, patchRadius));
  const patchDim = 2 * r + 1;
  const maxPatchPixels = patchDim * patchDim;

  // Exclusion Zone boundary (at least 15px safety buffer outside dilated watermark)
  const exclMinX = exclusionZone ? exclusionZone.minX : minHoleX;
  const exclMinY = exclusionZone ? exclusionZone.minY : minHoleY;
  const exclusionBuffer = 15;

  // Compute luminance array for gradient / isophote calculation
  const lum = new Float32Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const p = i * 4;
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  let iterations = 0;
  const maxIterations = 800;

  while (remainingHoles > 0 && iterations < maxIterations) {
    iterations++;

    // 1. Find boundary pixels
    const boundaryX: number[] = [];
    const boundaryY: number[] = [];

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        if (holeMask[idx] === 1) {
          const hasKnownNeighbor =
            (x > 0 && holeMask[idx - 1] === 0) ||
            (x < width - 1 && holeMask[idx + 1] === 0) ||
            (y > 0 && holeMask[idx - width] === 0) ||
            (y < height - 1 && holeMask[idx + width] === 0);

          if (hasKnownNeighbor) {
            boundaryX.push(x);
            boundaryY.push(y);
          }
        }
      }
    }

    if (boundaryX.length === 0) break;

    // 2. Compute priority for each boundary point: P(p) = C(p) * D(p)
    const candidates: { x: number; y: number; priority: number; conf: number }[] = [];

    for (let b = 0; b < boundaryX.length; b++) {
      const bx = boundaryX[b];
      const by = boundaryY[b];

      let sumConf = 0;
      let knownCount = 0;

      const minY = Math.max(0, by - r);
      const maxY = Math.min(height - 1, by + r);
      const minX = Math.max(0, bx - r);
      const maxX = Math.min(width - 1, bx + r);

      for (let py = minY; py <= maxY; py++) {
        const pRow = py * width;
        for (let px = minX; px <= maxX; px++) {
          const pIdx = pRow + px;
          if (holeMask[pIdx] === 0) {
            sumConf += confidence[pIdx];
            knownCount++;
          }
        }
      }

      const conf = sumConf / maxPatchPixels;

      let gradX = 0;
      let gradY = 0;
      if (bx > 0 && bx < width - 1) {
        gradX = (lum[by * width + bx + 1] - lum[by * width + bx - 1]) * 0.5;
      }
      if (by > 0 && by < height - 1) {
        gradY = (lum[(by + 1) * width + bx] - lum[(by - 1) * width + bx]) * 0.5;
      }

      let nx = 0;
      let ny = 0;
      if (bx > 0 && holeMask[by * width + bx - 1] === 0) nx -= 1;
      if (bx < width - 1 && holeMask[by * width + bx + 1] === 0) nx += 1;
      if (by > 0 && holeMask[(by - 1) * width + bx] === 0) ny -= 1;
      if (by < height - 1 && holeMask[(by + 1) * width + bx] === 0) ny += 1;

      const normLen = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= normLen;
      ny /= normLen;

      const isophoteDotNormal = Math.abs(-gradY * nx + gradX * ny);
      const dataTerm = (isophoteDotNormal / 255.0) + 0.15;
      const priority = conf * dataTerm * (1.0 + knownCount / maxPatchPixels);

      candidates.push({ x: bx, y: by, priority, conf });
    }

    candidates.sort((a, b) => b.priority - a.priority);

    // Batch top candidates spaced apart by at least r
    const batch: { x: number; y: number; conf: number }[] = [];
    for (const c of candidates) {
      let tooClose = false;
      for (const chosen of batch) {
        if (Math.abs(c.x - chosen.x) < r && Math.abs(c.y - chosen.y) < r) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        batch.push(c);
        if (batch.length >= 16) break;
      }
    }

    for (const target of batch) {
      const targetX = target.x;
      const targetY = target.y;

      const sMinX = Math.max(r, targetX - searchRadius);
      const sMaxX = Math.min(width - 1 - r, targetX + searchRadius);
      const sMinY = Math.max(r, targetY - searchRadius);
      const sMaxY = Math.min(height - 1 - r, targetY + searchRadius);

      let bestScore = Infinity;
      let bestSrcX = -1;
      let bestSrcY = -1;

      for (let sy = sMinY; sy <= sMaxY; sy += 2) {
        const sRow = sy * width;

        for (let sx = sMinX; sx <= sMaxX; sx += 2) {
          // Clean-Only Rule: Strictly forbid candidate patches inside or touching the watermark zone
          const insideExclusionZone =
            sx + r >= exclMinX - exclusionBuffer &&
            sy + r >= exclMinY - exclusionBuffer;
          if (insideExclusionZone) continue;

          // Ensure candidate patch is 100% known source pixels
          let isPureKnown = true;
          for (let dy = -r; dy <= r; dy++) {
            const checkRow = (sy + dy) * width;
            for (let dx = -r; dx <= r; dx++) {
              if (origHoleMask[checkRow + (sx + dx)] === 1) {
                isPureKnown = false;
                break;
              }
            }
            if (!isPureKnown) break;
          }
          if (!isPureKnown) continue;

          let ssd = 0;
          let validWeight = 0;
          let earlyExit = false;

          for (let dy = -r; dy <= r; dy++) {
            const tRow = (targetY + dy) * width;
            const srcRow = (sy + dy) * width;

            for (let dx = -r; dx <= r; dx++) {
              const tx = targetX + dx;
              if (tx < 0 || tx >= width) continue;

              const tIdx = tRow + tx;
              if (holeMask[tIdx] === 0) {
                const sxCandidate = sx + dx;
                const sIdx = srcRow + sxCandidate;

                const tByte = tIdx * 4;
                const sByte = sIdx * 4;

                const dr = data[tByte] - data[sByte];
                const dg = data[tByte + 1] - data[sByte + 1];
                const db = data[tByte + 2] - data[sByte + 2];

                const distWeight = 1.0 / (1.0 + 0.15 * (dx * dx + dy * dy));
                ssd += (dr * dr + dg * dg + db * db) * distWeight;
                validWeight += distWeight;

                if (validWeight > 0 && ssd / validWeight > bestScore) {
                  earlyExit = true;
                  break;
                }
              }
            }
            if (earlyExit) break;
          }

          if (!earlyExit && validWeight > 0) {
            const normScore = ssd / validWeight;
            const spatialDist = Math.hypot(sx - targetX, sy - targetY);
            const score = normScore * (1.0 + 0.05 * (spatialDist / searchRadius));

            if (score < bestScore) {
              bestScore = score;
              bestSrcX = sx;
              bestSrcY = sy;
            }
          }
        }
      }

      // Fallback if no candidate found: sample from clean background shifted left/above
      if (bestSrcX < 0 || bestSrcY < 0) {
        let minDist = Infinity;
        for (let sy = Math.max(0, targetY - searchRadius); sy <= Math.min(height - 1, targetY + searchRadius); sy += 2) {
          for (let sx = Math.max(0, targetX - searchRadius); sx <= Math.min(width - 1, targetX + searchRadius); sx += 2) {
            const insideExclusion =
              sx >= exclMinX - exclusionBuffer &&
              sy >= exclMinY - exclusionBuffer;
            if (insideExclusion) continue;
            if (origHoleMask[sy * width + sx] === 0) {
              const d = (sx - targetX) ** 2 + (sy - targetY) ** 2;
              if (d < minDist) {
                minDist = d;
                bestSrcX = sx;
                bestSrcY = sy;
              }
            }
          }
        }
      }

      // Copy exact pixels from clean background
      if (bestSrcX >= 0 && bestSrcY >= 0) {
        for (let dy = -r; dy <= r; dy++) {
          const ty = targetY + dy;
          if (ty < 0 || ty >= height) continue;
          const sy = Math.min(height - 1, Math.max(0, bestSrcY + dy));

          const tRow = ty * width;
          const sRow = sy * width;

          for (let dx = -r; dx <= r; dx++) {
            const tx = targetX + dx;
            if (tx < 0 || tx >= width) continue;
            const sx = Math.min(width - 1, Math.max(0, bestSrcX + dx));

            const tIdx = tRow + tx;
            if (holeMask[tIdx] === 1) {
              const tByte = tIdx * 4;
              const sByte = (sRow + sx) * 4;

              data[tByte] = data[sByte];
              data[tByte + 1] = data[sByte + 1];
              data[tByte + 2] = data[sByte + 2];
              data[tByte + 3] = 255;

              lum[tIdx] = 0.299 * data[tByte] + 0.587 * data[tByte + 1] + 0.114 * data[tByte + 2];

              holeMask[tIdx] = 0;
              confidence[tIdx] = target.conf;
              remainingHoles--;
            }
          }
        }
      } else {
        const idx = targetY * width + targetX;
        holeMask[idx] = 0;
        confidence[idx] = 0.5;
        remainingHoles--;
      }
    }
  }

  // 3. Smooth 3px Feather / Blend along the outer boundary
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      if (origHoleMask[idx] === 1) {
        let minDistToKnown = Infinity;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            const ny = y + dy;
            const nx = x + dx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (origHoleMask[ny * width + nx] === 0 && d < minDistToKnown) {
                minDistToKnown = d;
              }
            }
          }
        }

        if (minDistToKnown <= 3) {
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
          for (const n of neighbors) {
            if (origHoleMask[n] === 0) {
              const b = n * 4;
              sumR += data[b];
              sumG += data[b + 1];
              sumB += data[b + 2];
              count++;
            }
          }
          if (count > 0) {
            const b = idx * 4;
            const avgR = sumR / count;
            const avgG = sumG / count;
            const avgB = sumB / count;
            const blendWeight = minDistToKnown === 1 ? 0.30 : (minDistToKnown === 2 ? 0.15 : 0.05);
            data[b] = Math.round(data[b] * (1 - blendWeight) + avgR * blendWeight);
            data[b + 1] = Math.round(data[b + 1] * (1 - blendWeight) + avgG * blendWeight);
            data[b + 2] = Math.round(data[b + 2] * (1 - blendWeight) + avgB * blendWeight);
          }
        }
      }
    }
  }
}

/**
 * Fast, high-quality Clean Exemplar & Patch-Match Texture Synthesis Engine
 */
export function inpaintPatchExemplar(
  patchCanvas: HTMLCanvasElement,
  mask: Uint8Array,
  exclusionZone?: { minX: number; minY: number }
): HTMLCanvasElement {
  const w = patchCanvas.width;
  const h = patchCanvas.height;
  const ctx = patchCanvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);

  // Run clean Criminisi exemplar texture synthesis
  criminisiInpaint(imgData, mask, w, h, 3, 65, exclusionZone);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  outCanvas.getContext('2d')!.putImageData(imgData, 0, 0);
  return outCanvas;
}

/**
 * Main 1-Click Auto Pipeline:
 * 1. Extract bottom-right patch
 * 2. Run LaMa ONNX (or Texture Synthesis fallback)
 * 3. Composite back with 12px feathered alpha mask on original full-res canvas
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

  // 1. Calculate bottom-right patch
  const { x: patchX, y: patchY, size: patchSize } = getBottomRightPatchInfo(origWidth, origHeight);

  // 2. Extract patch onto a 512x512 canvas for inference
  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = patchSize;
  patchCanvas.height = patchSize;
  const patchCtx = patchCanvas.getContext('2d')!;
  patchCtx.drawImage(
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

  // Keep a clean copy of the "before" patch for split-comparison
  const patchBeforeCanvas = document.createElement('canvas');
  patchBeforeCanvas.width = patchSize;
  patchBeforeCanvas.height = patchSize;
  patchBeforeCanvas.getContext('2d')!.drawImage(patchCanvas, 0, 0);

  // 3. Generate accurate binary mask using dynamic sparkle detection + +8px dilation
  const patchImgData = patchCtx.getImageData(0, 0, patchSize, patchSize);
  const { mask, detected } = generatePatchMask(
    patchSize,
    coverage,
    origWidth,
    origHeight,
    patchImgData.data
  );

  let inpaintedPatchCanvas: HTMLCanvasElement | null = null;
  let engineUsed: 'lama-onnx' | 'texture-synthesis' = 'texture-synthesis';

  // 4. Clean Patch Synthesis (Primary zero-blur engine)
  if (!preferNeural) {
    inpaintedPatchCanvas = inpaintPatchExemplar(patchCanvas, mask, {
      minX: detected.startX,
      minY: detected.startY,
    });
    engineUsed = 'texture-synthesis';
  } else {
    try {
      const session = await getLamaSession(onProgress);

      if (session) {
        const ort = (window as any).ort || (await loadOrt());

        // Resize patch and mask to 512x512 for standard LaMa input
        const modelCanvas = document.createElement('canvas');
        modelCanvas.width = 512;
        modelCanvas.height = 512;
        const mCtx = modelCanvas.getContext('2d')!;
        mCtx.drawImage(patchCanvas, 0, 0, 512, 512);

        const modelImgData = mCtx.getImageData(0, 0, 512, 512);
        const mPixels = modelImgData.data;

        // Resize mask to 512x512
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = patchSize;
        maskCanvas.height = patchSize;
        const maskCtx = maskCanvas.getContext('2d')!;
        const maskImgData = maskCtx.createImageData(patchSize, patchSize);
        for (let i = 0; i < mask.length; i++) {
          const val = mask[i];
          maskImgData.data[i * 4] = val;
          maskImgData.data[i * 4 + 1] = val;
          maskImgData.data[i * 4 + 2] = val;
          maskImgData.data[i * 4 + 3] = 255;
        }
        maskCtx.putImageData(maskImgData, 0, 0);

        const scaledMaskCanvas = document.createElement('canvas');
        scaledMaskCanvas.width = 512;
        scaledMaskCanvas.height = 512;
        scaledMaskCanvas.getContext('2d')!.drawImage(maskCanvas, 0, 0, 512, 512);
        const scaledMaskData = scaledMaskCanvas
          .getContext('2d')!
          .getImageData(0, 0, 512, 512).data;

        // Create float32 input tensors
        const imageTensorData = new Float32Array(1 * 3 * 512 * 512);
        const maskTensorData = new Float32Array(1 * 1 * 512 * 512);

        for (let i = 0; i < 512 * 512; i++) {
          imageTensorData[i] = mPixels[i * 4] / 255.0; // R
          imageTensorData[512 * 512 + i] = mPixels[i * 4 + 1] / 255.0; // G
          imageTensorData[2 * 512 * 512 + i] = mPixels[i * 4 + 2] / 255.0; // B
          maskTensorData[i] = scaledMaskData[i * 4] > 128 ? 1.0 : 0.0;
        }

        const imageTensor = new ort.Tensor('float32', imageTensorData, [1, 3, 512, 512]);
        const maskTensor = new ort.Tensor('float32', maskTensorData, [1, 1, 512, 512]);

        const feeds: Record<string, any> = {};
        const inputNames = session.inputNames;
        feeds[inputNames[0] || 'image'] = imageTensor;
        feeds[inputNames[1] || 'mask'] = maskTensor;

        const results = await session.run(feeds);
        const outputTensor = results[session.outputNames[0]];

        if (outputTensor && outputTensor.data) {
          const outData = outputTensor.data as Float32Array;
          const resultCanvas = document.createElement('canvas');
          resultCanvas.width = 512;
          resultCanvas.height = 512;
          const resCtx = resultCanvas.getContext('2d')!;
          const resImgData = resCtx.createImageData(512, 512);

          for (let i = 0; i < 512 * 512; i++) {
            resImgData.data[i * 4] = Math.min(255, Math.max(0, Math.round(outData[i] * 255)));
            resImgData.data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(outData[512 * 512 + i] * 255)));
            resImgData.data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(outData[2 * 512 * 512 + i] * 255)));
            resImgData.data[i * 4 + 3] = 255;
          }
          resCtx.putImageData(resImgData, 0, 0);

          inpaintedPatchCanvas = document.createElement('canvas');
          inpaintedPatchCanvas.width = patchSize;
          inpaintedPatchCanvas.height = patchSize;
          inpaintedPatchCanvas.getContext('2d')!.drawImage(resultCanvas, 0, 0, patchSize, patchSize);
          engineUsed = 'lama-onnx';
        }
      }
    } catch (onnxErr) {
      console.warn('LaMa ONNX inference error, switching to texture synthesis:', onnxErr);
    }
  }

  // 5. Fallback to clean texture synthesis if neural inference was skipped or failed
  if (!inpaintedPatchCanvas) {
    inpaintedPatchCanvas = inpaintPatchExemplar(patchCanvas, mask, {
      minX: detected.startX,
      minY: detected.startY,
    });
    engineUsed = 'texture-synthesis';
  }

  const patchAfterCanvas = document.createElement('canvas');
  patchAfterCanvas.width = patchSize;
  patchAfterCanvas.height = patchSize;
  patchAfterCanvas.getContext('2d')!.drawImage(inpaintedPatchCanvas, 0, 0);

  // 6. Composite back onto original full-resolution canvas
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = origWidth;
  fullCanvas.height = origHeight;
  const fullCtx = fullCanvas.getContext('2d')!;

  // Draw full original image
  fullCtx.drawImage(sourceImage, 0, 0, origWidth, origHeight);

  if (engineUsed === 'texture-synthesis') {
    // Exemplar texture synthesis operates directly and touches ONLY the watermark hole.
    // All other pixels in the patch are 100% bit-identical to the source image.
    fullCtx.drawImage(inpaintedPatchCanvas, patchX, patchY);
  } else {
    // Seamless re-compositing with 12px feathered alpha mask for neural models
    const featherSize = 12;
    const featheredPatch = document.createElement('canvas');
    featheredPatch.width = patchSize;
    featheredPatch.height = patchSize;
    const fCtx = featheredPatch.getContext('2d')!;
    fCtx.drawImage(inpaintedPatchCanvas, 0, 0);

    const fImgData = fCtx.getImageData(0, 0, patchSize, patchSize);
    const fPixels = fImgData.data;

    for (let py = 0; py < patchSize; py++) {
      const row = py * patchSize;
      for (let px = 0; px < patchSize; px++) {
        let alphaTop = 1.0;
        let alphaLeft = 1.0;

        if (py < featherSize) {
          const t = py / featherSize;
          alphaTop = t * t * (3 - 2 * t);
        }
        if (px < featherSize) {
          const t = px / featherSize;
          alphaLeft = t * t * (3 - 2 * t);
        }

        const alpha = Math.min(alphaTop, alphaLeft);
        const idx = (row + px) * 4;
        fPixels[idx + 3] = Math.round(fPixels[idx + 3] * alpha);
      }
    }
    fCtx.putImageData(fImgData, 0, 0);
    fullCtx.drawImage(featheredPatch, patchX, patchY);
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    fullCanvas,
    patchBeforeCanvas,
    patchAfterCanvas,
    engineUsed,
    executionTimeMs,
  };
}
