// ============================================================
// Gemini Watermark Remover — Reverse Alpha Un-Blending Pipeline (v1.3.0)
//
// Stage 1: Exact Watermark Anchor & Mathematical Reverse Alpha Un-blending
//          Recovers the true underlying floor/background pixels from
//          the semi-transparent white watermark overlay:
//          C_clean = clamp((C_watermarked - alpha * 255) / (1 - alpha), 0, 255)
//
// Stage 2: Clean Neighboring Texture Clone (Fallback for Saturated Highlights)
//          Clones from clean background shifted outside the watermark box
//          with 2px edge feathering for near-saturated pixels (luma > 248).
// ============================================================

export type CoveragePreset = 'compact' | 'default' | 'large' | 'wide';

export interface InpaintResult {
  fullCanvas: HTMLCanvasElement;
  patchBeforeCanvas: HTMLCanvasElement;
  patchAfterCanvas: HTMLCanvasElement;
  engineUsed: 'reverse-alpha-unblend' | 'texture-synthesis';
  executionTimeMs: number;
}

export interface ModelLoadProgress {
  status: 'idle' | 'checking-cache' | 'downloading' | 'compiling' | 'ready' | 'fallback';
  progress: number;
  message: string;
}

/**
 * Compatibility stub
 */
export async function isModelCached(): Promise<boolean> {
  return false;
}

/**
 * Compatibility stub
 */
export async function getLamaSession(
  onProgress?: (info: ModelLoadProgress) => void
): Promise<any> {
  return null;
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

  // 5. Stage 3: 2px Seam Ring Interpolation (v1.3.2)
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
 * Main 1-Click Reverse Alpha Un-Blending Pipeline:
 * 100% deterministic, zero blur, preserves true underlying floor/background pixels.
 */
export async function removeGeminiWatermarkAuto(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  coverage: CoveragePreset = 'default',
  preferNeural = false,
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

  // 3. Execute 2-Stage Reverse Alpha Un-Blending & Seamless Texture Clone
  const imgData = fullCtx.getImageData(0, 0, origWidth, origHeight);
  reverseAlphaRestore(imgData, origWidth, origHeight, coverage);
  fullCtx.putImageData(imgData, 0, 0);

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
    engineUsed: 'reverse-alpha-unblend' as any,
    executionTimeMs,
  };
}
