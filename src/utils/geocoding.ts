// ============================================================
// Reverse Geocoding via OpenStreetMap Nominatim
// ============================================================
import type { GeocodingResult } from '@/types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Format address concisely according to authentic Timemark style:
 * [House Number + Street], P.[Ward], [Province]
 * E.g., "16 Lê Thái Tổ, P.Vũng Áng, Hà Tĩnh"
 */
export function formatConciseAddress(data: any): string {
  if (!data) return '';
  const addr = data.address || {};
  const isVietnam =
    addr.country_code === 'vn' ||
    addr.country === 'Việt Nam' ||
    addr.country === 'Vietnam' ||
    /[\u00C0-\u1EF9]/.test(data.display_name || '');

  if (isVietnam) {
    // 1. Street part
    let streetPart = '';
    const road = (addr.road || addr.pedestrian || addr.highway || '').replace(/^Đường\s+/i, '').trim();
    if (addr.house_number && road) {
      streetPart = `${addr.house_number} ${road}`;
    } else if (road) {
      streetPart = road;
    } else if (addr.house_number) {
      streetPart = addr.house_number;
    }

    // 2. Ward / Suburb part
    let wardPart = '';
    const rawWard = (
      addr.quarter ||
      addr.suburb ||
      addr.ward ||
      addr.neighbourhood ||
      addr.village ||
      ''
    ).trim();

    if (rawWard) {
      wardPart = rawWard
        .replace(/^Phường\s+/i, 'P.')
        .replace(/^Xã\s+/i, 'X.')
        .replace(/^Thị trấn\s+/i, 'TT.')
        .trim();
      // If it looks like a ward name without prefix, format as P.Ward
      if (!/^(P\.|X\.|TT\.)/i.test(wardPart) && !addr.village) {
        wardPart = `P.${wardPart}`;
      }
    }

    // 3. Province / City part
    let provPart = '';
    const rawProv = (addr.province || addr.state || addr.city || '').trim();
    if (rawProv) {
      provPart = rawProv
        .replace(/^Tỉnh\s+/i, '')
        .replace(/^Thành phố\s+/i, '')
        .trim();
    }

    const parts = [streetPart, wardPart, provPart].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }

  // Generic / International fallback: concise street, city, country
  const parts: string[] = [];
  if (addr.house_number && addr.road) {
    parts.push(`${addr.house_number} ${addr.road}`);
  } else if (addr.road) {
    parts.push(addr.road);
  }

  if (addr.suburb || addr.neighbourhood) {
    parts.push(addr.suburb || addr.neighbourhood);
  }

  if (addr.city || addr.town || addr.village) {
    parts.push(addr.city || addr.town || addr.village);
  }

  if (addr.state && !parts.includes(addr.state)) {
    parts.push(addr.state);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  // If all else fails, take the first 3 segments of displayName
  if (data.display_name) {
    return data.display_name
      .split(',')
      .slice(0, 3)
      .map((s: string) => s.trim())
      .join(', ');
  }

  return '';
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodingResult | null> {
  try {
    const params = new URLSearchParams({
      lat: latitude.toString(),
      lon: longitude.toString(),
      format: 'json',
      addressdetails: '1',
      zoom: '18',
    });

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'Accept-Language': 'vi,en;q=0.9',
        'User-Agent': 'TimemarkClone/1.0',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data || data.error) return null;

    const address = formatConciseAddress(data);

    return {
      address: address || data.display_name || '',
      displayName: data.display_name || address,
    };
  } catch (error) {
    console.warn('Reverse geocoding failed:', error);
    return null;
  }
}

export async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}
