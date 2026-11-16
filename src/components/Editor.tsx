'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WatermarkSettings } from '@/types';
import { createDefaultSettings } from '@/types';
import ImageUploader from './ImageUploader';
import CanvasPreview from './CanvasPreview';
import ControlPanel from './ControlPanel';
import { parseExif, parseGps } from '@/utils/exifParser';
import { reverseGeocode } from '@/utils/geocoding';
import { renderWatermark, exportCanvasAsBlob, downloadBlob } from '@/utils/watermarkRenderer';
import { loadFonts } from '@/utils/fontLoader';
import {
  Download,
  RotateCcw,
  Image as ImageIcon,
  Info,
  Loader2,
} from 'lucide-react';

export default function Editor() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [settings, setSettings] = useState<WatermarkSettings>(createDefaultSettings());
  const [isExporting, setIsExporting] = useState(false);
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number; size: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Preload fonts on mount
  useEffect(() => {
    loadFonts();
  }, []);

  // ---- Image load handler ----
  const handleImageLoad = useCallback(async (file: File, img: HTMLImageElement) => {
    setImage(img);
    setFileName(file.name.replace(/\.[^.]+$/, ''));
    setImageInfo({
      width: img.naturalWidth,
      height: img.naturalHeight,
      size: formatFileSize(file.size),
    });

    // Parse EXIF data
    const exif = await parseExif(file);
    const updates: Partial<WatermarkSettings> = {};

    if (exif.dateTime) {
      updates.dateTime = exif.dateTime;
    } else {
      updates.dateTime = new Date();
    }

    // Try GPS from main EXIF, then dedicated GPS parser
    let lat = exif.latitude;
    let lng = exif.longitude;

    if (lat === null || lng === null) {
      const gps = await parseGps(file);
      if (gps) {
        lat = gps.latitude;
        lng = gps.longitude;
      }
    }

    if (lat !== null && lng !== null) {
      updates.latitude = lat;
      updates.longitude = lng;

      // Reverse geocode
      try {
        const geo = await reverseGeocode(lat, lng);
        if (geo) {
          updates.address = geo.address;
        }
      } catch {
        // Geocoding failure is not critical
      }
    }

    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // ---- Settings update handler ----
  const handleSettingsChange = useCallback((updates: Partial<WatermarkSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // ---- Export / Download with native share fallback ----
  const handleDownload = useCallback(async () => {
    if (!image) return;
    setIsExporting(true);

    try {
      const { canvas } = await renderWatermark(image, settings);
      const blob = await exportCanvasAsBlob(canvas, 0.95);
      const outputFilename = `${fileName || 'photo'}_timemark.jpg`;

      // Check mobile Web Share API for native Camera Roll saving
      const file = new File([blob], outputFilename, { type: 'image/jpeg' });
      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [file] }) &&
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      ) {
        try {
          await navigator.share({
            files: [file],
            title: outputFilename,
          });
          setIsExporting(false);
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            setIsExporting(false);
            return;
          }
        }
      }

      // Standard direct download
      downloadBlob(blob, outputFilename);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Không thể lưu ảnh. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  }, [image, settings, fileName]);

  // ---- Reset ----
  const handleReset = useCallback(() => {
    setImage(null);
    setFileName('');
    setSettings(createDefaultSettings());
    setImageInfo(null);
  }, []);

  // ---- Upload screen ----
  if (!image) {
    return <ImageUploader onImageLoad={handleImageLoad} />;
  }

  // ---- Editor screen: Split Mobile View vs Desktop Side-by-Side ----
  return (
    <div className="h-[calc(100dvh-48px)] flex flex-col lg:flex-row overflow-hidden relative fade-in">
      {/* ============================================================ */}
      {/* 1. TOP STICKY PREVIEW (Mobile: 44dvh sticky / Desktop: flex-1) */}
      {/* ============================================================ */}
      <div className="h-[43dvh] sm:h-[46dvh] lg:h-full lg:flex-1 flex flex-col flex-none relative bg-black/80 border-b lg:border-b-0 lg:border-r border-editor-border overflow-hidden">
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between px-5 py-2.5 border-b border-editor-border bg-editor-surface/60">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-neutral-300">Timemark Watermark</span>
            {imageInfo && (
              <span className="text-xs text-neutral-500">
                {imageInfo.width} × {imageInfo.height} • {imageInfo.size}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs text-neutral-400 hover:text-white bg-editor-surface border border-editor-border transition-colors flex items-center gap-1.5 min-h-[36px]"
            >
              <RotateCcw size={13} />
              Chọn ảnh khác
            </button>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="btn-download !py-1.5 !px-4 !text-xs !rounded-xl !min-h-[36px] flex items-center gap-1.5"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isExporting ? 'Đang lưu...' : 'Tải ảnh về'}
            </button>
          </div>
        </div>

        {/* Floating Quick Action Button on Mobile Preview */}
        <button
          onClick={handleReset}
          className="lg:hidden absolute top-2.5 right-2.5 z-20 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-medium flex items-center gap-1 shadow-lg active:scale-95 transition-transform"
        >
          <RotateCcw size={12} />
          <span>Đổi ảnh</span>
        </button>

        {/* Live Canvas Preview (Always Visible on Top Half) */}
        <div className="flex-1 p-2 sm:p-3 overflow-hidden flex items-center justify-center">
          <CanvasPreview image={image} settings={settings} canvasRef={canvasRef} />
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. BOTTOM SCROLLABLE CONTROL SHEET (Remaining height)        */}
      {/* ============================================================ */}
      <div className="flex-1 lg:w-[380px] xl:w-[420px] lg:flex-none flex flex-col overflow-hidden bg-editor-bg pb-20 lg:pb-0">
        <ControlPanel settings={settings} onChange={handleSettingsChange} />
      </div>

      {/* ============================================================ */}
      {/* 3. STICKY BOTTOM ACTION BAR (Mobile Only)                    */}
      {/* ============================================================ */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-editor-bg/95 backdrop-blur-lg border-t border-editor-border px-4 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] shadow-2xl">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isExporting}
          className="btn-download"
        >
          {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          <span>{isExporting ? 'Đang xuất ảnh...' : 'Tải ảnh về (Download)'}</span>
        </button>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
