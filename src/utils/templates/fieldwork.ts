// ============================================================
// Template 2: Field Work / Construction Card
// Semi-transparent dark card with structured rows, header bar,
// and icon-based fields for professional documentation.
// ============================================================
import type { WatermarkSettings } from '@/types';
import { formatDate, formatTime, getDayOfWeek, formatCoordinates } from '@/types';
import {
  drawClockIcon,
  drawLocationPin,
  drawGpsIcon,
  drawUserIcon,
  drawNoteIcon,
  drawWeatherIcon,
  drawAltitudeIcon,
} from '@/utils/canvasIcons';

interface FieldRow {
  icon: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => void;
  label: string;
  value: string;
}

export function renderFieldworkTemplate(
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
  const cardPadding = 20 * scaleFactor;
  const headerHeight = 44 * scaleFactor;
  const rowHeight = 36 * scaleFactor;
  const iconSize = 22 * scaleFactor;
  const fontSize = 18 * scaleFactor;
  const labelSize = 13 * scaleFactor;
  const headerFontSize = 20 * scaleFactor;
  const cornerRadius = 12 * scaleFactor;
  const accentBarHeight = 4 * scaleFactor;

  // ---- Build field rows ----
  const rows: FieldRow[] = [];

  // Time & Date (always shown)
  rows.push({
    icon: drawClockIcon,
    label: 'Date & Time',
    value: `${formatDate(settings.dateTime, settings.dateFormat, settings.language)} ${formatTime(settings.dateTime, settings.showSeconds)}  •  ${getDayOfWeek(settings.dateTime, settings.language)}`,
  });

  // Address
  if (settings.address) {
    rows.push({
      icon: drawLocationPin,
      label: 'Location',
      value: settings.address,
    });
  }

  // Coordinates
  if (settings.showCoordinates && settings.latitude !== null && settings.longitude !== null) {
    rows.push({
      icon: drawGpsIcon,
      label: 'Coordinates',
      value: formatCoordinates(settings.latitude, settings.longitude),
    });
  }

  // Weather
  if (settings.showWeather && settings.weather) {
    rows.push({
      icon: drawWeatherIcon,
      label: 'Weather',
      value: settings.weather,
    });
  }

  // Altitude
  if (settings.showAltitude && settings.altitude) {
    rows.push({
      icon: drawAltitudeIcon,
      label: 'Altitude',
      value: settings.altitude,
    });
  }

  // Photographer
  if (settings.showPhotographer && settings.photographer) {
    rows.push({
      icon: drawUserIcon,
      label: 'Taken by',
      value: settings.photographer,
    });
  }

  // Note
  if (settings.showNote && settings.note) {
    rows.push({
      icon: drawNoteIcon,
      label: 'Note',
      value: settings.note,
    });
  }

  // ---- Card dimensions ----
  const cardWidth = Math.min(imgWidth * 0.55, 520 * scaleFactor);
  const cardHeight = headerHeight + accentBarHeight + rows.length * rowHeight + cardPadding * 2;

  // ---- Position ----
  let cardX: number, cardY: number;
  switch (settings.position) {
    case 'top-left':
      cardX = padding;
      cardY = padding;
      break;
    case 'top-right':
      cardX = imgWidth - padding - cardWidth;
      cardY = padding;
      break;
    case 'bottom-right':
      cardX = imgWidth - padding - cardWidth;
      cardY = imgHeight - padding - cardHeight;
      break;
    case 'bottom-left':
    default:
      cardX = padding;
      cardY = imgHeight - padding - cardHeight;
      break;
  }

  // ---- Draw card background ----
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 16 * scaleFactor;
  ctx.shadowOffsetY = 4 * scaleFactor;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, cornerRadius);
  ctx.fill();

  // Reset shadow for inner elements
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ---- Accent bar at top ----
  ctx.fillStyle = settings.accentColor;
  drawRoundedRectTop(ctx, cardX, cardY, cardWidth, accentBarHeight, cornerRadius);
  ctx.fill();

  // ---- Header ----
  const headerY = cardY + accentBarHeight;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(cardX, headerY, cardWidth, headerHeight);

  // Header title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${headerFontSize}px "Inter", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(settings.title || 'Site Inspection', cardX + cardPadding, headerY + headerHeight / 2);

  // Header accent dot
  const titleWidth = ctx.measureText(settings.title || 'Site Inspection').width;
  ctx.fillStyle = settings.accentColor;
  ctx.beginPath();
  ctx.arc(cardX + cardPadding + titleWidth + 10 * scaleFactor, headerY + headerHeight / 2, 4 * scaleFactor, 0, Math.PI * 2);
  ctx.fill();

  // ---- Divider line ----
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1 * scaleFactor;
  ctx.beginPath();
  ctx.moveTo(cardX + cardPadding, headerY + headerHeight);
  ctx.lineTo(cardX + cardWidth - cardPadding, headerY + headerHeight);
  ctx.stroke();

  // ---- Rows ----
  const rowStartY = headerY + headerHeight + cardPadding;

  rows.forEach((row, index) => {
    const rowY = rowStartY + index * rowHeight;

    // Icon
    ctx.shadowColor = 'transparent';
    row.icon(ctx, cardX + cardPadding, rowY + (rowHeight - iconSize) / 2, iconSize, settings.accentColor);

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `400 ${labelSize}px "Inter", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, cardX + cardPadding + iconSize + 10 * scaleFactor, rowY + 2 * scaleFactor);

    // Value
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `500 ${fontSize}px "Inter", sans-serif`;
    ctx.textBaseline = 'bottom';

    // Truncate value if too wide
    const maxValueWidth = cardWidth - cardPadding * 2 - iconSize - 14 * scaleFactor;
    let displayValue = row.value;
    while (ctx.measureText(displayValue).width > maxValueWidth && displayValue.length > 5) {
      displayValue = displayValue.slice(0, -4) + '...';
    }
    ctx.fillText(displayValue, cardX + cardPadding + iconSize + 10 * scaleFactor, rowY + rowHeight - 2 * scaleFactor);

    // Subtle separator
    if (index < rows.length - 1) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1 * scaleFactor;
      ctx.beginPath();
      ctx.moveTo(cardX + cardPadding + iconSize + 10 * scaleFactor, rowY + rowHeight);
      ctx.lineTo(cardX + cardWidth - cardPadding, rowY + rowHeight);
      ctx.stroke();
    }
  });

  // ---- Verified badge at bottom of card ----
  if (settings.showVerifiedBadge) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = `400 ${labelSize * 0.9}px "Inter", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Verified by Timemark', cardX + cardWidth - cardPadding, cardY + cardHeight - cardPadding * 0.4);
  }

  ctx.restore();
}

// ---- Helper: Rounded rectangle ----
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawRoundedRectTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
