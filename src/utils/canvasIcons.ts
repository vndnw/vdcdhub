// ============================================================
// Canvas Icon Drawers — SVG-like icon primitives for Canvas
// ============================================================

/** Draw a location/map pin icon */
export function drawLocationPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();

  const cx = x + size / 2;
  const cy = y + size * 0.4;
  const r = size * 0.35;

  // Pin body (circle top)
  ctx.arc(cx, cy, r, Math.PI, 0);

  // Pin point
  ctx.lineTo(cx, y + size * 0.95);
  ctx.lineTo(cx - r, cy);

  ctx.fill();

  // Inner circle (white dot)
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Draw a clock icon */
export function drawClockIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';

  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.4;

  // Circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Hour hand
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.55);
  ctx.stroke();

  // Minute hand
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.45, cy - r * 0.2);
  ctx.stroke();

  ctx.restore();
}

/** Draw a calendar icon */
export function drawCalendarIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pad = size * 0.15;
  const w = size - pad * 2;
  const h = size - pad * 2;

  // Rectangle
  ctx.strokeRect(x + pad, y + pad + h * 0.15, w, h * 0.85);

  // Top bar
  ctx.beginPath();
  ctx.moveTo(x + pad, y + pad + h * 0.35);
  ctx.lineTo(x + pad + w, y + pad + h * 0.35);
  ctx.stroke();

  // Top hooks
  ctx.beginPath();
  ctx.moveTo(x + pad + w * 0.3, y + pad);
  ctx.lineTo(x + pad + w * 0.3, y + pad + h * 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + pad + w * 0.7, y + pad);
  ctx.lineTo(x + pad + w * 0.7, y + pad + h * 0.25);
  ctx.stroke();

  ctx.restore();
}

/** Draw a user/photographer icon */
export function drawUserIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;

  const cx = x + size / 2;

  // Head
  ctx.beginPath();
  ctx.arc(cx, y + size * 0.3, size * 0.17, 0, Math.PI * 2);
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.arc(cx, y + size * 0.85, size * 0.3, Math.PI + 0.3, -0.3);
  ctx.stroke();

  ctx.restore();
}

/** Draw a note/document icon */
export function drawNoteIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';

  const pad = size * 0.18;
  const w = size - pad * 2;
  const h = size - pad * 2;

  ctx.strokeRect(x + pad, y + pad, w, h);

  // Lines
  for (let i = 0; i < 3; i++) {
    const ly = y + pad + h * (0.3 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(x + pad + w * 0.15, ly);
    ctx.lineTo(x + pad + w * (i < 2 ? 0.85 : 0.6), ly);
    ctx.stroke();
  }

  ctx.restore();
}

/** Draw a weather/cloud icon */
export function drawWeatherIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;

  const cx = x + size / 2;
  const cy = y + size * 0.5;

  // Cloud shape
  ctx.beginPath();
  ctx.arc(cx - size * 0.08, cy - size * 0.05, size * 0.18, Math.PI, 0);
  ctx.arc(cx + size * 0.12, cy, size * 0.15, Math.PI * 1.3, Math.PI * 0.1);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.1);
  ctx.arc(cx - size * 0.18, cy + size * 0.02, size * 0.12, Math.PI * 0.7, Math.PI);
  ctx.stroke();

  ctx.restore();
}

/** Draw a mountain/altitude icon */
export function drawAltitudeIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pad = size * 0.15;

  ctx.beginPath();
  ctx.moveTo(x + pad, y + size - pad);
  ctx.lineTo(x + size * 0.4, y + pad + size * 0.1);
  ctx.lineTo(x + size * 0.55, y + size * 0.45);
  ctx.lineTo(x + size * 0.65, y + size * 0.3);
  ctx.lineTo(x + size - pad, y + size - pad);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/** Draw a crosshair/GPS icon */
export function drawGpsIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;

  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.3;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair lines
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - size * 0.08);
  ctx.lineTo(cx, cy + r + size * 0.08);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - r - size * 0.08, cy);
  ctx.lineTo(cx + r + size * 0.08, cy);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

/** Draw a verified checkmark shield */
export function drawVerifiedBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.save();

  const cx = x + size / 2;
  const pad = size * 0.15;

  // Shield shape
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.moveTo(cx, y + pad);
  ctx.lineTo(x + size - pad, y + pad + size * 0.15);
  ctx.lineTo(x + size - pad, y + size * 0.55);
  ctx.quadraticCurveTo(cx, y + size - pad, cx, y + size - pad);
  ctx.quadraticCurveTo(cx, y + size - pad, x + pad, y + size * 0.55);
  ctx.lineTo(x + pad, y + pad + size * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Checkmark
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.15, y + size * 0.48);
  ctx.lineTo(cx - size * 0.02, y + size * 0.6);
  ctx.lineTo(cx + size * 0.18, y + size * 0.35);
  ctx.stroke();

  ctx.restore();
}
