'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { WatermarkSettings, CropRect } from '@/types';
import { computeMediaCrop } from '@/types';
import { renderWatermarkToCanvas, drawWatermarkOnly } from '@/utils/watermarkRenderer';
import { loadFonts } from '@/utils/fontLoader';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface CanvasPreviewProps {
  image?: HTMLImageElement | null;
  video?: HTMLVideoElement | null;
  videoSrc?: string | null;
  settings: WatermarkSettings;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  overlayCanvasRef?: React.RefObject<HTMLCanvasElement>;
  videoRef?: React.RefObject<HTMLVideoElement>;
  zoom: number;
  pan: { x: number; y: number };
  onZoomChange: (newZoom: number) => void;
  onPanChange: (newPan: { x: number; y: number }) => void;
  onStageSizeChange?: (size: { width: number; height: number }) => void;
}

export default function CanvasPreview({
  image,
  video,
  videoSrc,
  settings,
  canvasRef,
  overlayCanvasRef,
  videoRef,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  onStageSizeChange,
}: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = videoRef || internalVideoRef;

  const internalOverlayRef = useRef<HTMLCanvasElement>(null);
  const activeOverlayRef = overlayCanvasRef || internalOverlayRef;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const renderRef = useRef(0);

  // Dragging state for panning the media
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Video playback & timeline state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Determine media natural dimensions
  const mediaWidth = video
    ? video.videoWidth || 1280
    : image
    ? image.naturalWidth || 1000
    : 1000;
  const mediaHeight = video
    ? video.videoHeight || 720
    : image
    ? image.naturalHeight || 1000
    : 1000;

  // Calculate unscaled rendered stage size fitting the viewport container at 1x
  const stageSize = useMemo(() => {
    const vpW = Math.max(100, containerSize.width || 300);
    const vpH = Math.max(100, containerSize.height || 300);
    const mediaAspect = mediaWidth / mediaHeight;
    const vpAspect = vpW / vpH;

    let width = vpW;
    let height = vpH;

    if (containerSize.width > 0 && containerSize.height > 0) {
      if (mediaAspect > vpAspect) {
        width = vpW;
        height = vpW / mediaAspect;
      } else {
        height = vpH;
        width = vpH * mediaAspect;
      }
    }

    return { width: Math.round(width), height: Math.round(height) };
  }, [mediaWidth, mediaHeight, containerSize]);

  // Notify parent of stage size for export crop calculations
  useEffect(() => {
    if (stageSize.width > 0 && stageSize.height > 0) {
      onStageSizeChange?.(stageSize);
    }
  }, [stageSize, onStageSizeChange]);

  // Optical crop bounds: Clamp pan so no black bars ever appear around edges
  const maxPanX = useMemo(() => {
    return (stageSize.width * (Math.max(1.0, zoom) - 1)) / 2;
  }, [stageSize.width, zoom]);

  const maxPanY = useMemo(() => {
    return (stageSize.height * (Math.max(1.0, zoom) - 1)) / 2;
  }, [stageSize.height, zoom]);

  const handleZoomChange = (newZoom: number) => {
    const clamped = Math.max(1.0, Math.min(3.0, newZoom));
    onZoomChange(clamped);

    if (clamped <= 1.0) {
      onPanChange({ x: 0, y: 0 });
    } else {
      const newMaxX = (stageSize.width * (clamped - 1)) / 2;
      const newMaxY = (stageSize.height * (clamped - 1)) / 2;
      onPanChange({
        x: Math.max(-newMaxX, Math.min(newMaxX, pan.x)),
        y: Math.max(-newMaxY, Math.min(newMaxY, pan.y)),
      });
    }
  };

  const handleResetZoom = () => {
    onZoomChange(1.0);
    onPanChange({ x: 0, y: 0 });
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1.0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1.0) return;
    e.preventDefault();

    const proposedX = e.clientX - dragStartRef.current.x;
    const proposedY = e.clientY - dragStartRef.current.y;

    onPanChange({
      x: Math.max(-maxPanX, Math.min(maxPanX, proposedX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, proposedY)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1.0 || e.touches.length !== 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.touches[0].clientX - pan.x,
      y: e.touches[0].clientY - pan.y,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || zoom <= 1.0 || e.touches.length !== 1) return;
    if (e.cancelable) e.preventDefault();

    const proposedX = e.touches[0].clientX - dragStartRef.current.x;
    const proposedY = e.touches[0].clientY - dragStartRef.current.y;

    onPanChange({
      x: Math.max(-maxPanX, Math.min(maxPanX, proposedX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, proposedY)),
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Window release listener to prevent drag sticking
  useEffect(() => {
    if (!isDragging) return;

    const onRelease = () => {
      setIsDragging(false);
    };

    window.addEventListener('mouseup', onRelease);
    window.addEventListener('touchend', onRelease);
    window.addEventListener('touchcancel', onRelease);

    return () => {
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('touchend', onRelease);
      window.removeEventListener('touchcancel', onRelease);
    };
  }, [isDragging]);

  // Observe container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Compute exact optical crop for the photo
  const currentCrop = useMemo(() => {
    return computeMediaCrop(
      mediaWidth,
      mediaHeight,
      zoom,
      pan.x,
      pan.y,
      stageSize.width,
      stageSize.height
    );
  }, [mediaWidth, mediaHeight, zoom, pan, stageSize]);

  // -------------------------------------------------------------
  // 1. IMAGE: Render cropped photo + standard unscaled Timemark watermark
  // -------------------------------------------------------------
  useEffect(() => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas || containerSize.width === 0) return;

    const renderId = ++renderRef.current;

    const timeout = setTimeout(async () => {
      if (renderId !== renderRef.current) return;

      try {
        await renderWatermarkToCanvas(
          canvas,
          image,
          settings,
          stageSize.width,
          stageSize.height,
          currentCrop
        );
      } catch (err) {
        console.error('Image render failed:', err);
      }
    }, 16);

    return () => clearTimeout(timeout);
  }, [image, settings, containerSize, canvasRef, stageSize, currentCrop]);

  // -------------------------------------------------------------
  // 2. VIDEO: Real-time ticking watermark overlay renderer
  // -------------------------------------------------------------
  const renderVideoOverlay = useCallback(() => {
    const overlay = activeOverlayRef.current;
    const v = activeVideoRef.current;
    if (!overlay || !video || !v) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const origW = v.videoWidth || 1280;
    const origH = v.videoHeight || 720;

    if (overlay.width !== origW || overlay.height !== origH) {
      overlay.width = origW;
      overlay.height = origH;
    }

    // Clear previous watermark frame
    ctx.clearRect(0, 0, origW, origH);

    // Advance clock in real time by video's elapsed seconds
    const curTime = v.currentTime || 0;
    const frameDate = new Date(settings.dateTime.getTime() + Math.floor(curTime) * 1000);
    const frameSettings = { ...settings, dateTime: frameDate };

    // Watermark sits fixed and unscaled at the corners of the output frame
    drawWatermarkOnly(ctx, frameSettings, origW, origH);
  }, [video, activeOverlayRef, activeVideoRef, settings]);

  // Update video overlay when settings or time changes
  useEffect(() => {
    if (!video) return;
    loadFonts().then(() => {
      renderVideoOverlay();
    });
  }, [video, settings, renderVideoOverlay]);

  // Video timeupdate and loadedmetadata listeners
  useEffect(() => {
    const v = activeVideoRef.current;
    if (!video || !v) return;

    const onTimeUpdate = () => {
      setVideoCurrentTime(v.currentTime);
      renderVideoOverlay();
    };

    const onLoadedMetadata = () => {
      setVideoDuration(v.duration || 0);
      renderVideoOverlay();
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('loadedmetadata', onLoadedMetadata);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [video, activeVideoRef, renderVideoOverlay]);

  // Video playback controls
  const togglePlay = () => {
    const v = activeVideoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
    } else {
      v.pause();
    }
  };

  const toggleMute = () => {
    const v = activeVideoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = activeVideoRef.current;
    if (!v) return;
    const targetTime = parseFloat(e.target.value);
    v.currentTime = targetTime;
    setVideoCurrentTime(targetTime);
    renderVideoOverlay();
  };

  const formatTimeCode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-black/90 relative">
      {/* ---------------- Video Playback Header Bar ---------------- */}
      {video && (
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/15 shadow-xl text-white select-none pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={togglePlay}
            className="p-1 rounded-full text-neutral-300 hover:text-white active:scale-95 transition-all"
            title={isPlaying ? 'Tạm dừng' : 'Phát video'}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <input
            type="range"
            min="0"
            max={videoDuration || 1}
            step="0.05"
            value={videoCurrentTime}
            onChange={handleSeek}
            className="w-20 sm:w-28 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-accent"
            aria-label="Tua video"
          />

          <span className="text-[10px] font-mono text-neutral-300">
            {formatTimeCode(videoCurrentTime)}/{formatTimeCode(videoDuration)}
          </span>

          <button
            type="button"
            onClick={toggleMute}
            className="p-1 rounded-full text-neutral-300 hover:text-white active:scale-95 transition-all"
            title={isMuted ? 'Bật âm thanh' : 'Tắt tiếng'}
          >
            {isMuted ? <VolumeX size={13} className="text-amber-400" /> : <Volume2 size={13} />}
          </button>
        </div>
      )}

      {/* ---------------- Viewport Frame (Holds Optical Crop Frame) ---------------- */}
      <div
        ref={containerRef}
        className="flex-1 w-full flex items-center justify-center p-2 sm:p-3 overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          touchAction: zoom > 1.0 ? 'none' : 'auto',
          cursor: zoom > 1.0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        {/* Output Crop Frame: Represents the exact 100% final output frame */}
        <div
          style={{
            width: `${stageSize.width}px`,
            height: `${stageSize.height}px`,
            position: 'relative',
            overflow: 'hidden',
            lineHeight: 0,
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
          }}
          className="rounded-sm bg-neutral-950"
        >
          {/* VIDEO MODE: Video zooms & pans underneath; Timemark overlay stays fixed on top */}
          {video && (
            <>
              <video
                ref={activeVideoRef}
                src={videoSrc || video.src}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
                className="rounded-sm"
                playsInline
                loop
                muted={isMuted}
                autoPlay
                controls={false}
              />
              {/* Fixed, unscaled Timemark overlay canvas for video */}
              <canvas
                ref={activeOverlayRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {/* IMAGE MODE: Canvas renders optical crop + fixed, crisp Timemark watermark */}
          {image && (
            <canvas
              ref={canvasRef as React.LegacyRef<HTMLCanvasElement>}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                pointerEvents: 'none',
              }}
              className="rounded-sm"
            />
          )}
        </div>
      </div>

      {/* ---------------- Dedicated Camera Zoom Slider Bar (Zero Overlap) ---------------- */}
      <div className="flex-none h-11 border-t border-editor-border bg-editor-surface/95 px-3 sm:px-4 flex items-center justify-between sm:justify-center gap-2 sm:gap-4 select-none z-20">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1">
            <ZoomIn size={13} className="text-accent" />
            <span className="hidden xs:inline">Thu phóng:</span>
          </span>

          <button
            type="button"
            onClick={() => handleZoomChange(Number((zoom - 0.25).toFixed(2)))}
            disabled={zoom <= 1.0}
            className="p-1 rounded-full text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
            title="Thu nhỏ"
          >
            <ZoomOut size={14} />
          </button>

          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="w-24 sm:w-36 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-accent"
            aria-label="Độ phóng đại quang học"
          />

          <button
            type="button"
            onClick={() => handleZoomChange(Number((zoom + 0.25).toFixed(2)))}
            disabled={zoom >= 3.0}
            className="p-1 rounded-full text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
            title="Phóng to"
          >
            <ZoomIn size={14} />
          </button>

          <span className="text-[11px] font-mono font-bold text-accent w-11 text-center">
            {zoom.toFixed(1)}x
          </span>
        </div>

        {zoom > 1.0 && (
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent text-black hover:bg-accent-light active:scale-95 transition-all shadow-sm flex items-center gap-1"
            title="Đặt lại góc chụp ban đầu (1.0x)"
          >
            <RotateCcw size={10} />
            <span>1.0x</span>
          </button>
        )}
      </div>
    </div>
  );
}
