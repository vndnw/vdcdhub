'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WatermarkSettings } from '@/types';
import { createDefaultSettings, formatTimemarkFilename } from '@/types';
import ImageUploader from './ImageUploader';
import CanvasPreview from './CanvasPreview';
import ControlPanel from './ControlPanel';
import { parseExif, parseGps } from '@/utils/exifParser';
import { reverseGeocode } from '@/utils/geocoding';
import { renderWatermark, exportCanvasAsBlob, downloadBlob } from '@/utils/watermarkRenderer';
import { renderVideoWatermark } from '@/utils/videoWatermarkRenderer';
import { loadFonts } from '@/utils/fontLoader';
import {
  Download,
  RotateCcw,
  Image as ImageIcon,
  Film,
  Loader2,
} from 'lucide-react';

export default function Editor() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [settings, setSettings] = useState<WatermarkSettings>(createDefaultSettings());
  const [isExporting, setIsExporting] = useState(false);
  const [mediaInfo, setMediaInfo] = useState<{ width: number; height: number; size: string } | null>(null);

  // Video export progress state
  const [videoExportProgress, setVideoExportProgress] = useState<{ progress: number; status: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Preload fonts on mount
  useEffect(() => {
    loadFonts();
  }, []);

  // ---- Image load handler ----
  const handleImageLoad = useCallback(async (file: File, img: HTMLImageElement) => {
    setImage(img);
    setVideo(null);
    setVideoFile(null);
    setVideoSrc(null);
    setFileName(file.name.replace(/\.[^.]+$/, ''));
    setMediaInfo({
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

  // ---- Video load handler ----
  const handleVideoLoad = useCallback(async (file: File, vid: HTMLVideoElement) => {
    setImage(null);
    setVideo(vid);
    setVideoFile(file);
    setVideoSrc(vid.src);
    setFileName(file.name.replace(/\.[^.]+$/, ''));
    setMediaInfo({
      width: vid.videoWidth || 1280,
      height: vid.videoHeight || 720,
      size: formatFileSize(file.size),
    });

    const updates: Partial<WatermarkSettings> = {};
    try {
      const exif = await parseExif(file);
      if (exif.dateTime) {
        updates.dateTime = exif.dateTime;
      } else {
        updates.dateTime = new Date(file.lastModified || Date.now());
      }
      if (exif.latitude !== null && exif.longitude !== null) {
        updates.latitude = exif.latitude;
        updates.longitude = exif.longitude;
        try {
          const geo = await reverseGeocode(exif.latitude, exif.longitude);
          if (geo) updates.address = geo.address;
        } catch {
          // Non-critical
        }
      }
    } catch {
      updates.dateTime = new Date(file.lastModified || Date.now());
    }

    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // ---- Settings update handler ----
  const handleSettingsChange = useCallback((updates: Partial<WatermarkSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // ---- Cancel video export ----
  const handleCancelExport = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExporting(false);
    setVideoExportProgress(null);
  }, []);

  // ---- Export / Download handler (Image or Video) ----
  const handleDownload = useCallback(async () => {
    if (!image && !video) return;

    // 1. VIDEO EXPORT
    if (video && videoFile) {
      setIsExporting(true);
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;
      setVideoExportProgress({ progress: 0, status: 'Đang chuẩn bị kết xuất video...' });

      try {
        const result = await renderVideoWatermark({
          videoFile,
          settings,
          onProgress: (progress, status) => {
            setVideoExportProgress({ progress, status });
          },
          signal: abortCtrl.signal,
        });

        // Mobile native share check
        const file = new File([result.blob], result.filename, { type: result.blob.type });
        if (
          typeof navigator !== 'undefined' &&
          navigator.canShare &&
          navigator.canShare({ files: [file] }) &&
          /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        ) {
          try {
            await navigator.share({
              files: [file],
              title: result.filename,
            });
            setIsExporting(false);
            setVideoExportProgress(null);
            return;
          } catch (shareErr: any) {
            if (shareErr.name === 'AbortError') {
              setIsExporting(false);
              setVideoExportProgress(null);
              return;
            }
          }
        }

        downloadBlob(result.blob, result.filename);
      } catch (err: any) {
        if (abortCtrl.signal.aborted) {
          console.log('Video export aborted by user');
        } else {
          console.error('Video export error:', err);
          alert('Không thể xuất video: ' + (err.message || 'Lỗi không xác định'));
        }
      } finally {
        setIsExporting(false);
        setVideoExportProgress(null);
        abortControllerRef.current = null;
      }
      return;
    }

    // 2. IMAGE EXPORT
    if (image) {
      setIsExporting(true);

      try {
        const { canvas } = await renderWatermark(image, settings);
        const blob = await exportCanvasAsBlob(canvas, 0.95);
        const outputFilename = formatTimemarkFilename(settings.dateTime, 'photo');

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
    }
  }, [image, video, videoFile, settings, fileName]);

  // ---- Reset ----
  const handleReset = useCallback(() => {
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
    }
    setImage(null);
    setVideo(null);
    setVideoFile(null);
    setVideoSrc(null);
    setFileName('');
    setSettings(createDefaultSettings());
    setMediaInfo(null);
  }, [videoSrc]);

  // ---- Upload screen ----
  if (!image && !video) {
    return <ImageUploader onImageLoad={handleImageLoad} onVideoLoad={handleVideoLoad} />;
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
            <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              {video ? (
                <>
                  <Film size={14} className="text-accent" />
                  <span>VDCD Húp — Timemark Video</span>
                </>
              ) : (
                <>
                  <ImageIcon size={14} className="text-neutral-400" />
                  <span>VDCD Húp — Timemark Stamp</span>
                </>
              )}
            </span>
            {mediaInfo && (
              <span className="text-xs text-neutral-500">
                {mediaInfo.width} × {mediaInfo.height} • {mediaInfo.size}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs text-neutral-400 hover:text-white bg-editor-surface border border-editor-border transition-colors flex items-center gap-1.5 min-h-[36px]"
            >
              <RotateCcw size={13} />
              Chọn tệp khác
            </button>
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="btn-download !py-1.5 !px-4 !text-xs !rounded-xl !min-h-[36px] flex items-center gap-1.5"
            >
              {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {isExporting
                ? video
                  ? 'Đang xuất video...'
                  : 'Đang lưu...'
                : video
                ? 'Tải video về (MP4)'
                : 'Tải ảnh về'}
            </button>
          </div>
        </div>

        {/* Floating Quick Action Button on Mobile Preview */}
        <button
          onClick={handleReset}
          className="lg:hidden absolute top-2.5 right-2.5 z-40 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-medium flex items-center gap-1 shadow-lg active:scale-95 transition-transform"
        >
          <RotateCcw size={12} />
          <span>Đổi tệp</span>
        </button>

        {/* Live Canvas / Video Preview */}
        <div className="flex-1 p-2 sm:p-3 overflow-hidden flex items-center justify-center">
          <CanvasPreview
            image={image}
            video={video}
            videoSrc={videoSrc}
            settings={settings}
            canvasRef={canvasRef}
            overlayCanvasRef={overlayCanvasRef}
            videoRef={videoRef}
          />
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
          <span>
            {isExporting
              ? video
                ? 'Đang xuất video...'
                : 'Đang xuất ảnh...'
              : video
              ? 'Tải video về (MP4)'
              : 'Tải ảnh về (Download)'}
          </span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 4. VIDEO EXPORT PROGRESS MODAL                               */}
      {/* ============================================================ */}
      {videoExportProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-editor-surface border border-editor-border p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent/20 text-accent flex items-center justify-center mb-4">
              <Film size={24} className="animate-pulse" />
            </div>

            <h3 className="text-base font-bold text-white mb-1">
              Đang xuất video Timemark...
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              {videoExportProgress.status || 'Vui lòng giữ ứng dụng mở trong khi xử lý'}
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-neutral-800 rounded-full h-2.5 mb-2 overflow-hidden border border-white/10">
              <div
                className="bg-gradient-to-r from-accent to-accent-light h-full rounded-full transition-all duration-150"
                style={{ width: `${Math.min(100, Math.max(0, videoExportProgress.progress))}%` }}
              />
            </div>

            <div className="flex justify-between w-full text-[11px] font-mono text-neutral-400 mb-6">
              <span>Tiến độ</span>
              <span className="font-bold text-accent">{videoExportProgress.progress}%</span>
            </div>

            <button
              type="button"
              onClick={handleCancelExport}
              className="w-full py-2.5 rounded-xl border border-white/20 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-white/10 active:scale-98 transition-all"
            >
              Hủy xuất video
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
