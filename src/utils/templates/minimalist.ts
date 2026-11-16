// ============================================================
// Template 3: Minimalist Stamp
// Clean white text with drop-shadow, compact 2-3 line format.
// Highest legibility on any background.
// ============================================================
import type { WatermarkSettings } from '@/types';
import { formatDate, formatTime, formatCoordinates } from '@/types';

export function renderMinimalistTemplate(
  ctx: CanvasRenderingContext2D,
  settings: WatermarkSettings,
  imgWidth: number,
  imgHeight: number,
  scaleFactor: number
): void {
  ctx.save();
  ctx.globalAlpha = settings.opacity;

  // ---- Measurements ----
  const padding = 40 * scaleFactor;
  const primarySize = 26 * scaleFactor;
  const secondarySize = 20 * scaleFactor;
  const tertiarySize = 14 * scaleFactor;
  const lineSpacing = 10 * scaleFactor;

  // ---- Drop shadow ----
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4 * scaleFactor;
  ctx.shadowOffsetX = 1 * scaleFactor;
  ctx.shadowOffsetY = 1 * scaleFactor;

  // ---- Calculate total height ----
  let totalLines = 1; // datetime line
  if (settings.address) totalLines++;
  if (settings.showCoordinates && settings.latitude !== null) totalLines++;
  if (settings.showNote && settings.note) totalLines++;
  if (settings.showVerifiedBadge) totalLines++;

  const totalHeight = primarySize + (totalLines - 1) * (secondarySize + lineSpacing);

  // ---- Position ----
  let textX: number, startY: number;
  let align: CanvasTextAlign = 'left';

  switch (settings.position) {
    case 'top-left':
      textX = padding;
      startY = padding;
      align = 'left';
      break;
    case 'top-right':
      textX = imgWidth - padding;
      startY = padding;
      align = 'right';
      break;
    case 'bottom-right':
      textX = imgWidth - padding;
      startY = imgHeight - padding - totalHeight;
      align = 'right';
      break;
    case 'bottom-left':
    default:
      textX = padding;
      startY = imgHeight - padding - totalHeight;
      align = 'left';
      break;
  }

  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  let currentY = startY;

  // ---- Line 1: Date & Time (primary) ----
  const dateTimeStr = `${formatDate(settings.dateTime, settings.dateFormat, settings.language)}  ${formatTime(settings.dateTime, settings.showSeconds)}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${primarySize}px "Inter", "Roboto", sans-serif`;
  ctx.fillText(dateTimeStr, textX, currentY);
  currentY += primarySize + lineSpacing;

  // ---- Line 2: Address ----
  if (settings.address) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `400 ${secondarySize}px "Inter", "Roboto", sans-serif`;

    const maxWidth = imgWidth * 0.65;
    let displayAddr = settings.address;
    while (ctx.measureText(displayAddr).width > maxWidth && displayAddr.length > 10) {
      displayAddr = displayAddr.slice(0, -4) + '...';
    }

    ctx.fillText(displayAddr, textX, currentY);
    currentY += secondarySize + lineSpacing;
  }

  // ---- Line 3: Coordinates ----
  if (settings.showCoordinates && settings.latitude !== null && settings.longitude !== null) {
    const coordStr = formatCoordinates(settings.latitude, settings.longitude);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `400 ${tertiarySize}px "Roboto Mono", monospace`;
    ctx.fillText(coordStr, textX, currentY);
    currentY += tertiarySize + lineSpacing;
  }

  // ---- Line 4: Note ----
  if (settings.showNote && settings.note) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = `italic 400 ${tertiarySize}px "Inter", sans-serif`;
    ctx.fillText(settings.note, textX, currentY);
    currentY += tertiarySize + lineSpacing;
  }

  // ---- Verified badge ----
  if (settings.showVerifiedBadge) {
    // Small accent bar
    const barWidth = 20 * scaleFactor;
    const barHeight = 2 * scaleFactor;
    const barX = align === 'right' ? textX - barWidth : textX;

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = settings.accentColor;
    ctx.fillRect(barX, currentY, barWidth, barHeight);
    currentY += barHeight + 6 * scaleFactor;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3 * scaleFactor;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `400 ${tertiarySize * 0.9}px "Inter", sans-serif`;
    ctx.fillText('Timemark Verified', textX, currentY);
  }

  ctx.restore();
}
