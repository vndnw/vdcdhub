// ============================================================
// Timemark Clone — Shared Types
// ============================================================

export type TemplateType = 'classic' | 'fieldwork' | 'minimalist';

export type DateFormatType = 'vi-standard' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY';

export type LanguageType = 'vi' | 'en';

export type WatermarkPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface WatermarkSettings {
  // Template
  template: TemplateType;

  // Language
  language: LanguageType;

  // Date & Time
  dateTime: Date;
  showSeconds: boolean;
  dateFormat: DateFormatType;

  // Location
  address: string;
  latitude: number | null;
  longitude: number | null;
  showLocationPin: boolean;

  // Custom fields
  note: string;
  weather: string;
  altitude: string;
  photographer: string;
  title: string; // For fieldwork card header

  // Verification & badges
  hashId: string;
  showVerifiedBadge: boolean;
  showCoordinates: boolean;

  // Toggle visibility
  showNote: boolean;
  showWeather: boolean;
  showAltitude: boolean;
  showPhotographer: boolean;

  // Visual adjustments
  scale: number;       // 0.5 to 1.5
  opacity: number;     // 0 to 1
  position: WatermarkPosition;
  accentColor: string; // hex color

  // Custom logo
  customLogo: string | null; // data URL
}

export interface ExifData {
  dateTime: Date | null;
  latitude: number | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
}

export interface GeocodingResult {
  address: string;
  displayName: string;
}

// Generate random Timemark hash ID (e.g., P1CM1HMA3TCPAL)
export function generateRandomHashId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 14; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Default settings factory
export function createDefaultSettings(): WatermarkSettings {
  return {
    template: 'classic',
    language: 'vi',
    dateTime: new Date(),
    showSeconds: false,
    dateFormat: 'vi-standard',
    address: '16 Lê Thái Tổ, P.Vũng Áng, Hà Tĩnh',
    latitude: 18.066667,
    longitude: 106.316667,
    showLocationPin: false,
    note: '',
    weather: '',
    altitude: '',
    photographer: '',
    title: 'Site Inspection',
    hashId: 'P1CM1HMA3TCPAL',
    showNote: false,
    showWeather: false,
    showAltitude: false,
    showPhotographer: false,
    showVerifiedBadge: true,
    showCoordinates: false, // Default false to match clean Timemark app look
    scale: 1.0,
    opacity: 1.0,
    position: 'bottom-left',
    accentColor: '#FFC107',
    customLogo: null,
  };
}

// Date formatting utility
export function formatDate(date: Date, format: DateFormatType, language: LanguageType = 'vi'): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const monthNum = (date.getMonth() + 1).toString();
  const year = date.getFullYear().toString();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  switch (format) {
    case 'vi-standard':
      // Authentic Timemark format: DD Tháng MM,YYYY (no space after comma)
      return `${day} Tháng ${monthNum},${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MMM DD, YYYY':
      return `${months[date.getMonth()]} ${day}, ${year}`;
    default:
      if (language === 'vi') {
        return `${day} Tháng ${monthNum},${year}`;
      }
      return `${day}/${month}/${year}`;
  }
}

export function formatTime(date: Date, showSeconds: boolean): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  if (showSeconds) {
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  return `${hours}:${minutes}`;
}

export function getDayOfWeek(date: Date, language: LanguageType = 'vi'): string {
  const daysVi = [
    'Chủ Nhật',
    'Thứ Hai',
    'Thứ Ba',
    'Thứ Tư',
    'Thứ Năm',
    'Thứ Sáu',
    'Thứ Bảy',
  ];
  const daysEn = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return language === 'vi' ? daysVi[date.getDay()] : daysEn[date.getDay()];
}

export function formatCoordinates(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return '';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
