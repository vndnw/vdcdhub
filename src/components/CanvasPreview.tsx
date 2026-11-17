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
  // Viewport & Stage DOM Refs
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = videoRef || internalVideoRef;

  const internalOverlayRef = useRef<HTMLCanvasElement>(null);
  const activeOverlayRef = overlayCanvasRef || internalOverlayRef;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const renderRef = useRef(0);

  // Zoom & Pan state for preview inspection (UI only, does not affect export)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Video playback & timeline state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [videoCurrentTime, setVideoCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Reset zoom & pan when image or video changes
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setVideoCurrentTime(0);
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
    const vpW = containerSize.width || 300;
    const vpH = containerSize.height || 300;
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

  // Calculate pan clamp bounds so all 4 edges (especially bottom Timemark) are 100% reachable
  const getPanBounds = useCallback(
    (currentZoom: number) => {
      const stageWidth = stageRef.current?.offsetWidth || stageSize.width;
      const stageHeight = stageRef.current?.offsetHeight || stageSize.height;
      const viewportWidth = viewportRef.current?.clientWidth || containerSize.width;
      const viewportHeight = viewportRef.current?.clientHeight || containerSize.height;

      // Allow dragging all the way to borders + margin to clear floating toolbars completely
      const maxPanX = Math.max(0, (stageWidth * currentZoom - viewportWidth) / 2 + 24);
      const maxPanY = Math.max(0, (stageHeight * currentZoom - viewportHeight) / 2 + 56);
      return { maxPanX, maxPanY };
    },
    [stageSize, containerSize]
  );

  const handleZoomChange = (newZoom: number) => {
    const clamped = Math.max(1.0, Math.min(3.0, newZoom));
    setZoom(clamped);
    if (clamped <= 1.0) {
      setPan({ x: 0, y: 0 });
    } else {
      const { maxPanX, maxPanY } = getPanBounds(clamped);
      setPan((prev) => ({
        x: Math.max(-maxPanX, Math.min(maxPanX, prev.x)),
        y: Math.max(-maxPanY, Math.min(maxPanY, prev.y)),
      }));
    }
  };

  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
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

    const { maxPanX, maxPanY } = getPanBounds(zoom);
    const proposedX = e.clientX - dragStartRef.current.x;
    const proposedY = e.clientY - dragStartRef.current.y;

    setPan({
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

    const { maxPanX, maxPanY } = getPanBounds(zoom);
    const proposedX = e.touches[0].clientX - dragStartRef.current.x;
    const proposedY = e.touches[0].clientY - dragStartRef.current.y;

    setPan({
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
    const container = viewportRef.current;
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

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-full min-h-[260px] flex items-center justify-center overflow-hidden select-none"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        touchAction: zoom > 1.0 ? 'none' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* ---------------- Video Playback Header Bar ---------------- */}
      {video && (
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/15 shadow-xl text-white select-none pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
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

      {/* ---------------- Single Unified Inner Stage (Media + Timemark Canvas) ---------------- */}
      <div
        ref={stageRef}
        style={{
          position: 'relative',
          display: 'inline-block',
          lineHeight: 0,
          width: `${Math.round(stageSize.width)}px`,
          height: `${Math.round(stageSize.height)}px`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          willChange: 'transform',
          transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0, 0, 0.2, 1)',
          cursor: zoom > 1.0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
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

      {/* ---------------- Floating Zoom Controls Bar (Bottom) ---------------- */}
      <div
        className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/15 shadow-xl text-white select-none pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => handleZoomChange(Number((zoom - 0.25).toFixed(2)))}
          disabled={zoom <= 1.0}
          className="p-1 rounded-full text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
          title="Thu nhỏ"
        >
          <ZoomOut size={13} />
        </button>

        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={zoom}
          onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
          className="w-20 sm:w-28 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-accent"
          aria-label="Độ phóng đại"
        />

        <button
          type="button"
          onClick={() => handleZoomChange(Number((zoom + 0.25).toFixed(2)))}
          disabled={zoom >= 3.0}
          className="p-1 rounded-full text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
          title="Phóng to"
        >
          <ZoomIn size={13} />
        </button>

        <span className="text-[11px] font-mono font-bold text-neutral-300 w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>

        {zoom > 1.0 && (
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-black hover:bg-accent-light active:scale-95 transition-all shadow-sm flex items-center gap-0.5"
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
