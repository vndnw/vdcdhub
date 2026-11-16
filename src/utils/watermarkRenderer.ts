// ============================================================
// Watermark Renderer — Main orchestrator
// Draws the original image onto a full-resolution canvas,
// then applies the selected template watermark.
// ============================================================
import type { WatermarkSettings } from '@/types';
import { renderClassicTemplate } from './templates/classic';
import { renderFieldworkTemplate } from './templates/fieldwork';
import { renderMinimalistTemplate } from './templates/minimalist';
import { loadFonts } from './fontLoader';

export interface RenderResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Render the watermarked image onto a canvas at the original image resolution.
 */
export async function renderWatermark(
  imageSource: HTMLImageElement,
  settings: WatermarkSettings
): Promise<RenderResult> {
  // Ensure fonts are loaded before rendering
  await loadFonts();

  const width = imageSource.naturalWidth;
  const height = imageSource.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context');

  // Draw the original image at full resolution
  ctx.drawImage(imageSource, 0, 0, width, height);

  // Calculate the scale factor based on image dimensions
  // Reference: 1000px dimension = 1.0x scale
  const scaleFactor = (Math.min(width, height) / 1000) * settings.scale;

  // Select and render the template
  switch (settings.template) {
    case 'classic':
      renderClassicTemplate(ctx, settings, width, height, scaleFactor);
      break;
    case 'fieldwork':
      renderFieldworkTemplate(ctx, settings, width, height, scaleFactor);
      break;
    case 'minimalist':
      renderMinimalistTemplate(ctx, settings, width, height, scaleFactor);
      break;
    default:
      renderClassicTemplate(ctx, settings, width, height, scaleFactor);
  }

  return { canvas, width, height };
}

/**
 * Render onto an existing canvas (for preview — may be scaled down).
 */
export async function renderWatermarkToCanvas(
  targetCanvas: HTMLCanvasElement,
  imageSource: HTMLImageElement,
  settings: WatermarkSettings,
  displayWidth: number,
  displayHeight: number
): Promise<void> {
  await loadFonts();

  const origW = imageSource.naturalWidth;
  const origH = imageSource.naturalHeight;

  targetCanvas.width = origW;
  targetCanvas.height = origH;

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // Draw original image
  ctx.drawImage(imageSource, 0, 0, origW, origH);

  // Scale factor
  const scaleFactor = (Math.min(origW, origH) / 1000) * settings.scale;

  // Render template
  switch (settings.template) {
    case 'classic':
      renderClassicTemplate(ctx, settings, origW, origH, scaleFactor);
      break;
    case 'fieldwork':
      renderFieldworkTemplate(ctx, settings, origW, origH, scaleFactor);
      break;
    case 'minimalist':
      renderMinimalistTemplate(ctx, settings, origW, origH, scaleFactor);
      break;
  }
}

/**
 * Export the canvas as a JPEG blob for download.
 */
export function exportCanvasAsBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Trigger a file download from a blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}
