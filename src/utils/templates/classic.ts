// ============================================================
// Template 1: Classic Timemark — Authentic Mobile App Clone
// Matches exact typography, layout, colors, and proportions
// of the real Timemark mobile app reference screenshot.
// ============================================================
import type { WatermarkSettings } from '@/types';
import { formatDate, formatTime, getDayOfWeek, formatCoordinates } from '@/types';
import { drawLocationPin } from '@/utils/canvasIcons';

export function renderClassicTemplate(
  ctx: CanvasRenderingContext2D,
  settings: WatermarkSettings,
  imgWidth: number,
  imgHeight: number,
  scaleFactor: number
): void {
  ctx.save();
  ctx.globalAlpha = settings.opacity;

  // ---- Proportions calibrated directly to the Timemark reference image ----
  // Clock font is tall, narrow, ~9.5% of image height
  const timeSize = Math.round(
    Math.max(imgHeight * 0.096, Math.min(imgWidth, imgHeight) * 0.125) * settings.scale
  );
  const dateSize = Math.round(timeSize * 0.26);
  const daySize = Math.round(timeSize * 0.26);
  const addressSize = Math.round(timeSize * 0.24);
  const coordSize = Math.round(timeSize * 0.18);
  const noteSize = Math.round(timeSize * 0.2);

  // Spacing
  const barWidth = Math.max(2.5, Math.round(3.2 * (Math.min(imgWidth, imgHeight) / 1000) * settings.scale));
  const barGap = Math.round(timeSize * 0.16);
  const addressGap = Math.round(timeSize * 0.24);
  const lineSpacing = Math.round(timeSize * 0.1);

  // Outer Margins
  const paddingX = Math.round(Math.min(imgWidth, imgHeight) * 0.045);
  const paddingY = Math.round(Math.min(imgWidth, imgHeight) * 0.045);

  // Total height calculation for position anchors
  const extraBottomHeight =
    (settings.address ? addressSize + addressGap : 0) +
    (settings.showCoordinates && settings.latitude !== null ? coordSize + lineSpacing : 0) +
    (settings.showNote && settings.note ? noteSize + lineSpacing : 0);

  let baseX: number, baseY: number;

  switch (settings.position) {
    case 'top-left':
      baseX = paddingX;
      baseY = paddingY + timeSize * 0.75;
      break;
    case 'top-right':
      baseX = imgWidth - paddingX - timeSize * 3.5;
      baseY = paddingY + timeSize * 0.75;
      break;
    case 'bottom-right':
      baseX = imgWidth - paddingX - timeSize * 3.5;
      baseY = imgHeight - paddingY - extraBottomHeight;
      break;
    case 'bottom-left':
    default:
      baseX = paddingX;
      baseY = imgHeight - paddingY - extraBottomHeight;
      break;
  }

  // Soft drop shadow for legibility over any photo
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = Math.max(3, 4 * scaleFactor);
  ctx.shadowOffsetX = 1 * scaleFactor;
  ctx.shadowOffsetY = 1 * scaleFactor;

  // -------------------------------------------------------------
  // 1. Tall Condensed Clock Font (e.g., "19:43")
  // Tall, narrow condensed sans-serif, weight 400 (regular)
  // -------------------------------------------------------------
  const timeStr = formatTime(settings.dateTime, settings.showSeconds);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `400 ${timeSize}px "Barlow Condensed", "Roboto Condensed", "Oswald", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(timeStr, baseX, baseY);

  const timeMetrics = ctx.measureText(timeStr);
  const timeWidth = timeMetrics.width;

  // Exact cap-height of clock digits
  const capHeight =
    timeMetrics.actualBoundingBoxAscent > 0
      ? timeMetrics.actualBoundingBoxAscent
      : Math.round(timeSize * 0.74);

  // -------------------------------------------------------------
  // 2. Vertical Yellow Accent Bar
  // Color #FFC107, matches exact cap-height of large clock digits
  // -------------------------------------------------------------
  const barTop = baseY - capHeight;
  const barBottom = baseY;
  const barHeight = barBottom - barTop;
  const barX = baseX + timeWidth + barGap;

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = settings.accentColor || '#FFC107';
  ctx.fillRect(barX, barTop, barWidth, barHeight);

  // -------------------------------------------------------------
  // 3. Date & Day of Week Block (Right of yellow bar)
  // Top line: DD Tháng MM,YYYY (e.g., 16 Tháng 11,2026)
  // Bottom line: Thứ Hai, Thứ Ba...
  // -------------------------------------------------------------
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = Math.max(3, 3.5 * scaleFactor);
  const textX = barX + barWidth + barGap;

  const dateStr = formatDate(settings.dateTime, settings.dateFormat, settings.language);
  const dayStr = getDayOfWeek(settings.dateTime, settings.language);

  // Top line: Date aligned with top of the yellow bar
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `400 ${dateSize}px "Inter", "Roboto", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(dateStr, textX, barTop - Math.round(dateSize * 0.06));

  // Bottom line: Day of week aligned with bottom of the yellow bar (baseline)
  ctx.font = `400 ${daySize}px "Inter", "Roboto", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(dayStr, textX, barBottom);

  // -------------------------------------------------------------
  // 4. Clean Address Line (Below the clock)
  // Clean single-line text aligned with the left edge of clock digits
  // -------------------------------------------------------------
  let currentY = baseY + addressGap;

  if (settings.address) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `400 ${addressSize}px "Inter", "Roboto", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let displayAddress = settings.address;
    const maxAddressWidth = imgWidth * 0.64;
    while (ctx.measureText(displayAddress).width > maxAddressWidth && displayAddress.length > 8) {
      displayAddress = displayAddress.slice(0, -4) + '...';
    }

    if (settings.showLocationPin) {
      // If user toggles location pin on
      const pinSize = Math.round(addressSize * 0.9);
      ctx.shadowColor = 'transparent';
      drawLocationPin(ctx, baseX, currentY, pinSize, settings.accentColor || '#FFC107');
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.fillText(displayAddress, baseX + pinSize + Math.round(6 * scaleFactor), currentY);
    } else {
      // Authentic Timemark: Clean address without pin icon
      ctx.fillText(displayAddress, baseX, currentY);
    }

    currentY += addressSize + lineSpacing;
  }

  // Optional GPS coordinates line (hidden by default in Classic)
  if (settings.showCoordinates && settings.latitude !== null && settings.longitude !== null) {
    const coordStr = formatCoordinates(settings.latitude, settings.longitude);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = `400 ${coordSize}px "Roboto Mono", "Inter", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(coordStr, baseX, currentY);
    currentY += coordSize + lineSpacing;
  }

  // Optional Note
  if (settings.showNote && settings.note) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `400 italic ${noteSize}px "Inter", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(settings.note, baseX, currentY);
    currentY += noteSize + lineSpacing;
  }

  // -------------------------------------------------------------
  // 5. Bottom-Right Logo: "Time" in gold/orange + "mark" in white
  // Directly beneath: "100% Chân thực" (or "100% Real")
  // -------------------------------------------------------------
  if (settings.showVerifiedBadge) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = Math.max(3, 4 * scaleFactor);

    const brandX = imgWidth - paddingX;
    const brandY = imgHeight - paddingY;

    const logoSize = Math.round(timeSize * 0.25);
    const subSize = Math.round(logoSize * 0.52);

    // Subtitle text: "100% Chân thực" (Vietnamese) or "100% Real"
    const subText = settings.language === 'en' ? '100% Real' : '100% Chân thực';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `400 ${subSize}px "Inter", "Roboto", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(subText, brandX, brandY);

    // "Time" (warm gold/orange #F5A623) + "mark" (white #FFFFFF)
    ctx.font = `700 ${logoSize}px "Inter", "Roboto", sans-serif`;
    const timeText = 'Time';
    const markText = 'mark';
    const wTime = ctx.measureText(timeText).width;
    const wMark = ctx.measureText(markText).width;
    const totalLogoWidth = wTime + wMark;

    const logoY = brandY - subSize - Math.round(3 * scaleFactor);
    const logoStartX = brandX - totalLogoWidth;

    // "Time" in warm gold/orange #F5A623
    ctx.fillStyle = '#F5A623';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeText, logoStartX, logoY);

    // "mark" in pure white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(markText, logoStartX + wTime, logoY);

    // -------------------------------------------------------------
    // 6. Right-Edge Vertical Verification Stamp
    // Rotated -90deg along right margin, starting 38% to 40% from bottom
    // (y = imgHeight * 0.615), extending upward toward the middle.
    // Leaves a wide, clean empty gap above the bottom-right Timemark logo.
    // Format: (✓) [14-CHAR-HASH]  Timemark Verified
    // -------------------------------------------------------------
    ctx.save();
    const stampX = imgWidth - Math.max(16 * scaleFactor, paddingX * 0.42);
    const stampY = Math.round(imgHeight * 0.615);

    ctx.translate(stampX, stampY);
    ctx.rotate(-Math.PI / 2);

    const verticalTextSize = Math.max(11, Math.round(timeSize * 0.14));
    const circleRadius = verticalTextSize * 0.55;

    // Circular checkmark icon
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = Math.max(1, 1.2 * scaleFactor);
    ctx.beginPath();
    ctx.arc(circleRadius, 0, circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Checkmark mark inside circle
    ctx.beginPath();
    ctx.moveTo(circleRadius - circleRadius * 0.45, 0);
    ctx.lineTo(circleRadius - circleRadius * 0.08, circleRadius * 0.38);
    ctx.lineTo(circleRadius + circleRadius * 0.5, -circleRadius * 0.4);
    ctx.stroke();

    // Verification text
    const hashStr = settings.hashId || 'P1CM1HMA3TCPAL';
    const stampText = `${hashStr}  Timemark Verified`;
    const textStartX = circleRadius * 2 + Math.round(6 * scaleFactor);

    ctx.font = `400 ${verticalTextSize}px "Inter", "Roboto", sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(stampText, textStartX, 0);

    ctx.restore();
  }

  // Custom user logo overlay if provided
  if (settings.customLogo) {
    drawCustomLogo(ctx, settings.customLogo, imgWidth, imgHeight, paddingX, scaleFactor);
  }

  ctx.restore();
}

function drawCustomLogo(
  ctx: CanvasRenderingContext2D,
  logoDataUrl: string,
  imgWidth: number,
  imgHeight: number,
  padding: number,
  scaleFactor: number
): void {
  const logoImg = new Image();
  logoImg.src = logoDataUrl;
  if (logoImg.complete && logoImg.naturalWidth > 0) {
    const maxLogoSize = 60 * scaleFactor;
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    let lw = maxLogoSize;
    let lh = maxLogoSize / aspect;
    if (lh > maxLogoSize) {
      lh = maxLogoSize;
      lw = maxLogoSize * aspect;
    }
    ctx.drawImage(logoImg, imgWidth - padding - lw, padding, lw, lh);
  }
}
