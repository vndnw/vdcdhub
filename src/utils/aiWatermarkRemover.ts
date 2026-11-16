// ============================================================
// Gemini Watermark Remover — Instant 2-Pass Texture Engine (v2.1.0)
//
// Pass 1: Pixel-Exact Reverse Alpha Un-Blending (Mathematical Recovery)
//         Restores the true underlying background luminance by inverting
//         the semi-transparent white watermark overlay:
//         C_clean = clamp((C_watermarked - alpha * 255) / (1 - alpha), 0, 255)
//
// Pass 2: Micro-Patch Exemplar Texture Synthesis (<30ms, 0MB Download)
//         Replaces remaining JPEG ringing/ghosting inside the tight 3px-dilated
//         star mask with exact sharp 6x6 pixel blocks sampled from the clean
//         surrounding tile ring (10px–45px outside), finished with a 1.5px feather blend.
// ============================================================

export type CoveragePreset = 'compact' | 'default' | 'large' | 'wide';

export interface InpaintResult {
  fullCanvas: HTMLCanvasElement;
  patchBeforeCanvas: HTMLCanvasElement;
  patchAfterCanvas: HTMLCanvasElement;
  engineUsed: 'instant-2pass-texture' | 'reverse-alpha-unblend';
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
  return true;
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
 * Instant 2-Pass Texture-Preserving Restoration Engine
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
  const rawSize = Math.round(Math.max(52, minDim * sizeScale * 1.25));

  // Extend box all the way to width - 4 and height - 4 to enclose all 4 tips
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

  // 2. Compute local background luminance (bgLuma) from the clean 8px border
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
        const ramp = Math.min(1.0, (delta - 5) / 5.0);
        const rawAlpha = ((delta - 4) / deltaDenom) * 1.15 * ramp;
        alphaMap[py * size + px] = Math.max(0, Math.min(0.85, rawAlpha));
      } else {
        alphaMap[py * size + px] = 0;
      }
    }
  }

  // ============================================================
  // PASS 1: Reverse Alpha Un-Blending & Saturated Highlights Clone
  // ============================================================
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

      if (pixelLuma > 248 && alpha > 0.65) {
        const srcX = Math.max(0, x - size - 12);
        const srcY = y;
        const srcIdx = (srcY * width + srcX) * 4;

        data[idx] = data[srcIdx];
        data[idx + 1] = data[srcIdx + 1];
        data[idx + 2] = data[srcIdx + 2];
        clonedCount++;
      } else {
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

  // Boundary Luminance Calibration (eliminates residual JPEG luminance discrepancy)
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

    const offsetR = Math.max(-18, Math.min(18, avgOuterR - avgInnerR));
    const offsetG = Math.max(-18, Math.min(18, avgOuterG - avgInnerG));
    const offsetB = Math.max(-18, Math.min(18, avgOuterB - avgInnerB));

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

  // ============================================================
  // PASS 2: Micro-Patch Texture Synthesis (v2.1.0)
  // Fast, localized Exemplar Texture Patch Synthesizer (6x6 pixel blocks)
  // restricted strictly to the tight ~45x45px star mask.
  // ============================================================
  const tightStarMask = new Uint8Array(size * size);
  const dilateR = 3;

  // 1. Build tight star mask (dilated by 3px to cover JPEG compression blocks around tips)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let isMasked = false;
      for (let dy = -dilateR; dy <= dilateR && !isMasked; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -dilateR; dx <= dilateR && !isMasked; dx++) {
          if (dx * dx + dy * dy > 9.0) continue; // 3px radius
          const nx = px + dx;
          if (nx < 0 || nx >= size) continue;
          if (alphaMap[ny * size + nx] > 0.02) {
            isMasked = true;
          }
        }
      }
      if (isMasked) {
        tightStarMask[py * size + px] = 1;
      }
    }
  }

  // 2. Pre-collect candidate 6x6 source blocks from the clean surrounding tile ring
  // (10px to 45px outside the star mask, strictly excluding any masked pixels)
  const candidateBlocks: { x: number; y: number }[] = [];
  const minCleanDist = 10;
  const maxCleanDist = 45;

  for (let dy = -maxCleanDist; dy <= size + 10; dy += 3) {
    const sy = boxY + dy;
    if (sy < 0 || sy >= height - 6) continue;

    for (let dx = -maxCleanDist; dx <= size + 10; dx += 3) {
      const sx = boxX + dx;
      if (sx < 0 || sx >= width - 6) continue;

      const inBoxX = sx - boxX;
      const inBoxY = sy - boxY;

      let tooClose = false;
      if (
        inBoxX >= -minCleanDist &&
        inBoxX <= size + minCleanDist &&
        inBoxY >= -minCleanDist &&
        inBoxY <= size + minCleanDist
      ) {
        tooClose = true;
      }

      const boxCenterX = boxX + size / 2;
      const boxCenterY = boxY + size / 2;
      const distFromCenter = Math.hypot(sx + 3 - boxCenterX, sy + 3 - boxCenterY);

      if (!tooClose && distFromCenter <= maxCleanDist + size / 2) {
        candidateBlocks.push({ x: sx, y: sy });
      }
    }
  }

  // Fallback: If surrounding area has too few candidates, sample from clean background left/top
  if (candidateBlocks.length < 15) {
    for (let sy = Math.max(0, boxY - 40); sy < Math.min(height - 6, boxY + size); sy += 3) {
      for (let sx = Math.max(0, boxX - 50); sx < Math.max(0, boxX - 12); sx += 3) {
        candidateBlocks.push({ x: sx, y: sy });
      }
    }
  }

  // 3. Synthesize texture into the star mask using 6x6 exemplar blocks with stride 3
  const synthBufferR = new Float32Array(size * size);
  const synthBufferG = new Float32Array(size * size);
  const synthBufferB = new Float32Array(size * size);
  const synthWeight = new Float32Array(size * size);

  const blockSize = 6;
  const stride = 3;

  for (let by = 0; by <= size - blockSize; by += stride) {
    for (let bx = 0; bx <= size - blockSize; bx += stride) {
      let hasMasked = false;
      for (let dy = 0; dy < blockSize && !hasMasked; dy++) {
        for (let dx = 0; dx < blockSize && !hasMasked; dx++) {
          if (tightStarMask[(by + dy) * size + (bx + dx)] === 1) {
            hasMasked = true;
          }
        }
      }
      if (!hasMasked) continue;

      let bestScore = Infinity;
      let bestCand = candidateBlocks[0] || {
        x: Math.max(0, boxX - 25),
        y: Math.max(0, boxY - 25),
      };

      for (let i = 0; i < candidateBlocks.length; i++) {
        const cand = candidateBlocks[i];
        let score = 0;

        for (let dy = 0; dy < blockSize; dy++) {
          const cy = cand.y + dy;
          const ty = boxY + by + dy;
          const cRow = cy * width;
          const tRow = ty * width;

          for (let dx = 0; dx < blockSize; dx++) {
            const cx = cand.x + dx;
            const tx = boxX + bx + dx;

            const cIdx = (cRow + cx) * 4;
            const tIdx = (tRow + tx) * 4;

            const dr = data[cIdx] - data[tIdx];
            const dg = data[cIdx + 1] - data[tIdx + 1];
            const db = data[cIdx + 2] - data[tIdx + 2];
            const pixelDiff = dr * dr + dg * dg + db * db;

            const isCleanBoundary = tightStarMask[(by + dy) * size + (bx + dx)] === 0;
            score += isCleanBoundary ? pixelDiff * 3.0 : pixelDiff;
          }
        }

        if (score < bestScore) {
          bestScore = score;
          bestCand = cand;
        }
      }

      for (let dy = 0; dy < blockSize; dy++) {
        const cy = bestCand.y + dy;
        const cRow = cy * width;
        for (let dx = 0; dx < blockSize; dx++) {
          const cx = bestCand.x + dx;
          const cIdx = (cRow + cx) * 4;
          const bufIdx = (by + dy) * size + (bx + dx);

          synthBufferR[bufIdx] += data[cIdx];
          synthBufferG[bufIdx] += data[cIdx + 1];
          synthBufferB[bufIdx] += data[cIdx + 2];
          synthWeight[bufIdx] += 1.0;
        }
      }
    }
  }

  // 4. Apply synthesized texture with 1.5px edge blend on the star mask perimeter
  for (let py = 0; py < size; py++) {
    const y = boxY + py;
    const row = y * width;
    for (let px = 0; px < size; px++) {
      if (tightStarMask[py * size + px] !== 1) continue;

      const bufIdx = py * size + px;
      if (synthWeight[bufIdx] <= 0) continue;

      const synthR = synthBufferR[bufIdx] / synthWeight[bufIdx];
      const synthG = synthBufferG[bufIdx] / synthWeight[bufIdx];
      const synthB = synthBufferB[bufIdx] / synthWeight[bufIdx];

      // Measure distance to nearest clean pixel (tightStarMask === 0)
      let minDistSq = 999;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = py + dy;
        for (let dx = -2; dx <= 2; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > 4.5) continue;
          const nx = px + dx;
          const isClean =
            nx < 0 || nx >= size || ny < 0 || ny >= size || tightStarMask[ny * size + nx] === 0;
          if (isClean && d2 < minDistSq) {
            minDistSq = d2;
          }
        }
      }

      const minDist = Math.sqrt(minDistSq);
      // 1.5px feather edge blend: 0 at boundary ramping to 1.0 inside the star
      const blendFactor = Math.min(1.0, minDist / 1.5);

      const idx = (row + (boxX + px)) * 4;
      const pass1R = data[idx];
      const pass1G = data[idx + 1];
      const pass1B = data[idx + 2];

      const grain = (Math.random() - 0.5) * 2.0;

      data[idx] = Math.max(
        0,
        Math.min(255, Math.round(synthR * blendFactor + pass1R * (1.0 - blendFactor) + grain))
      );
      data[idx + 1] = Math.max(
        0,
        Math.min(255, Math.round(synthG * blendFactor + pass1G * (1.0 - blendFactor) + grain))
      );
      data[idx + 2] = Math.max(
        0,
        Math.min(255, Math.round(synthB * blendFactor + pass1B * (1.0 - blendFactor) + grain))
      );
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
 * Main 1-Click Instant Watermark Removal Pipeline (v2.1.0):
 * Instant 2-Pass Texture-Preserving Engine (<30ms, 0MB download).
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

  onProgress?.({
    status: 'ready',
    progress: 50,
    message: 'Đang phục hồi chi tiết...',
  });

  // 3. Execute 2-Pass Restoration Engine (<30ms)
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

  onProgress?.({
    status: 'ready',
    progress: 100,
    message: 'Hoàn tất!',
  });

  return {
    fullCanvas,
    patchBeforeCanvas,
    patchAfterCanvas,
    engineUsed: 'instant-2pass-texture',
    executionTimeMs,
  };
}
