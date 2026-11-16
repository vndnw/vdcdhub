// ============================================================
// EXIF Parser — Extract metadata from uploaded images
// ============================================================
import type { ExifData } from '@/types';

export async function parseExif(file: File): Promise<ExifData> {
  try {
    // Dynamic import to avoid SSR issues
    const exifr = (await import('exifr')).default;

    const data = await exifr.parse(file, {
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
        'GPSLatitude',
        'GPSLongitude',
        'GPSLatitudeRef',
        'GPSLongitudeRef',
        'Make',
        'Model',
      ],
    });

    if (!data) {
      return { dateTime: null, latitude: null, longitude: null, make: null, model: null };
    }

    // Parse date
    let dateTime: Date | null = null;
    if (data.DateTimeOriginal) {
      dateTime = new Date(data.DateTimeOriginal);
    } else if (data.CreateDate) {
      dateTime = new Date(data.CreateDate);
    } else if (data.ModifyDate) {
      dateTime = new Date(data.ModifyDate);
    }

    // Validate date
    if (dateTime && isNaN(dateTime.getTime())) {
      dateTime = null;
    }

    // Parse GPS — exifr already converts to decimal degrees
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (typeof data.GPSLatitude === 'number' && typeof data.GPSLongitude === 'number') {
      latitude = data.GPSLatitude;
      longitude = data.GPSLongitude;
    } else if (data.latitude !== undefined && data.longitude !== undefined) {
      latitude = data.latitude;
      longitude = data.longitude;
    }

    return {
      dateTime,
      latitude,
      longitude,
      make: data.Make || null,
      model: data.Model || null,
    };
  } catch (error) {
    console.warn('EXIF parsing failed:', error);
    return { dateTime: null, latitude: null, longitude: null, make: null, model: null };
  }
}

// Also try to get GPS from exifr's GPS-specific parser
export async function parseGps(file: File): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const exifr = (await import('exifr')).default;
    const gps = await exifr.gps(file);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      return { latitude: gps.latitude, longitude: gps.longitude };
    }
    return null;
  } catch {
    return null;
  }
}
