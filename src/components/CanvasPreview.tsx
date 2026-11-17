'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { WatermarkSettings } from '@/types';
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
}

export default function CanvasPreview({
  image,
  video,
  videoSrc,
  settings,
  canvasRef,
  overlayCanvasRef,
  videoRef,
}: CanvasPreviewProps) {
  // Viewport & Scroll Container DOM Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = videoRef || internalVideoRef;

  const internalOverlayRef = useRef<HTMLCanvasElement>(null);
  const activeOverlayRef = overlayCanvasRef || internalOverlayRef;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const renderRef = useRef(0);

  // Zoom state (UI only, does not affect export resolution)
  const [zoom, setZoom] = useState<number>(1.0);

  // Desktop mouse drag-to-scroll support
  const isMouseDownRef = useRef(false);
  const mouseStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Video playback & timeline state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Reset zoom when image or video changes
  useEffect(() => {
    setZoom(1.0);
    setVideoCurrentTime(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [image, videoSrc]);

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

    return { width, height };
  }, [mediaWidth, mediaHeight, containerSize]);

  const handleZoomChange = (newZoom: number) => {
    const clamped = Math.max(1.0, Math.min(3.0, newZoom));
    setZoom(clamped);
    if (clamped <= 1.0 && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  };

  const handleResetZoom = () => {
    setZoom(1.0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  };

  // Desktop mouse drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1.0 || !scrollContainerRef.current) return;
    isMouseDownRef.current = true;
    mouseStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollContainerRef.current.scrollLeft,
      scrollTop: scrollContainerRef.current.scrollTop,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || zoom <= 1.0 || !scrollContainerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - mouseStartRef.current.x;
    const dy = e.clientY - mouseStartRef.current.y;
    scrollContainerRef.current.scrollLeft = mouseStartRef.current.scrollLeft - dx;
    scrollContainerRef.current.scrollTop = mouseStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
  };

  // Observe container size
  useEffect(() => {
    const container = scrollContainerRef.current;
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

  // -------------------------------------------------------------
  // 1. IMAGE: Render watermark whenever settings or image changes
  // -------------------------------------------------------------
  useEffect(() => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas || containerSize.width === 0) return;

    const renderId = ++renderRef.current;

    const timeout = setTimeout(async () => {
      if (renderId !== renderRef.current) return;

      try {
        await renderWatermarkToCanvas(canvas, image, settings, stageSize.width, stageSize.height);
      } catch (err) {
        console.error('Image render failed:', err);
      }
    }, 16);

    return () => clearTimeout(timeout);
  }, [image, settings, containerSize, canvasRef, stageSize]);

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

  const isZoomed = zoom > 1.0;

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

      {/* ---------------- Native Scrollable Media Viewport ---------------- */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 w-full overflow-auto select-none ${
          isZoomed ? 'cursor-grab active:cursor-grabbing p-3 sm:p-4 pb-8' : 'flex items-center justify-center p-2 sm:p-3'
        }`}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: isZoomed ? 'pan-x pan-y' : 'auto',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Single Unified Inner Stage: Locks Timemark Canvas tightly to the Media */}
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            lineHeight: 0,
            width: isZoomed ? `${Math.round(stageSize.width * zoom)}px` : `${Math.round(stageSize.width)}px`,
            height: isZoomed ? `${Math.round(stageSize.height * zoom)}px` : `${Math.round(stageSize.height)}px`,
            maxWidth: isZoomed ? 'none' : '100%',
            maxHeight: isZoomed ? 'none' : '100%',
            flexShrink: 0,
            margin: isZoomed ? 'auto' : undefined,
            transition: 'width 0.15s ease-out, height 0.15s ease-out',
          }}
        >
          {/* VIDEO MODE */}
          {video && (
            <>
              <video
                ref={activeVideoRef}
                src={videoSrc || video.src}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  pointerEvents: 'none',
                }}
                className="rounded-sm"
                playsInline
                loop
                muted={isMuted}
                autoPlay
                controls={false}
              />
              {/* Live transparent overlay canvas for real-time ticking watermark */}
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

          {/* IMAGE MODE */}
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

      {/* ---------------- Dedicated Slim Zoom Control Bar (Below Preview Frame - Zero Overlap) ---------------- */}
      <div className="flex-none h-10 border-t border-editor-border bg-editor-surface/95 px-3 sm:px-4 flex items-center justify-between sm:justify-center gap-2 sm:gap-4 select-none z-20">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[11px] font-medium text-neutral-400 hidden xs:inline">Thu phóng:</span>

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
            aria-label="Độ phóng đại"
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

          <span className="text-[11px] font-mono font-bold text-neutral-300 w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {isZoomed && (
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent text-black hover:bg-accent-light active:scale-95 transition-all shadow-sm flex items-center gap-1"
            title="Đặt lại kích thước ban đầu (1x)"
          >
            <RotateCcw size={10} />
            <span>1x</span>
          </button>
        )}
      </div>
    </div>
  );
}
