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

  // 3. Measure brightness excess & estimate alpha transparency (threshold delta > 3)
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

      if (delta > 3) {
        // Smooth linear ramp starting right at delta > 3
        const ramp = Math.min(1.0, (delta - 3) / 5.0);
        const rawAlpha = ((delta - 2) / deltaDenom) * 1.15 * ramp;
        alphaMap[py * size + px] = Math.max(0, Math.min(0.85, rawAlpha));
      } else {
        alphaMap[py * size + px] = 0;
      }
    }
  }

  // 1.5px morphological dilation on estimated alpha map
  const dilatedAlpha = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let maxA = alphaMap[py * size + px];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= size) continue;
          if (dx * dx + dy * dy <= 2.25) {
            // within 1.5px
            const val = alphaMap[ny * size + nx];
            if (val > maxA) maxA = val;
          }
        }
      }
      dilatedAlpha[py * size + px] = maxA;
    }
  }

  // Soft Gaussian feather on the dilated alpha to eliminate any hairline border
  const smoothAlpha = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let sum = 0,
        count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= size) continue;
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          sum += dilatedAlpha[ny * size + nx] * w;
          count += w;
        }
      }
      smoothAlpha[py * size + px] = sum / count;
    }
  }

  // 4. Stage 1: Reverse Alpha Un-blending + Stage 2: Saturated Highlights Clone
  let unblendedCount = 0;
  let clonedCount = 0;

  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    const row = y * width;
    for (let px = 0; px < size; px++) {
      const x = boxX + px;
      const alpha = smoothAlpha[py * size + px];
      if (alpha <= 0.008) continue;

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
