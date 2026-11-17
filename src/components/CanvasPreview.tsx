'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { WatermarkSettings } from '@/types';
import { renderWatermarkToCanvas } from '@/utils/watermarkRenderer';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CanvasPreviewProps {
  image: HTMLImageElement;
  settings: WatermarkSettings;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export default function CanvasPreview({ image, settings, canvasRef }: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const renderRef = useRef(0);

  // Zoom & Pan state for preview inspection (UI only, does not affect export)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset zoom & pan when a new image is loaded
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, [image]);

  const handleZoomChange = (newZoom: number) => {
    const clamped = Math.max(1.0, Math.min(3.0, newZoom));
    setZoom(clamped);
    if (clamped <= 1.0) {
      setPan({ x: 0, y: 0 });
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

    const maxPanX = Math.max(60, (containerSize.width * (zoom - 1)) / 2 + 80);
    const maxPanY = Math.max(60, (containerSize.height * (zoom - 1)) / 2 + 80);

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

    const maxPanX = Math.max(60, (containerSize.width * (zoom - 1)) / 2 + 80);
    const maxPanY = Math.max(60, (containerSize.height * (zoom - 1)) / 2 + 80);

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

  // Render watermark whenever settings or image change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || containerSize.width === 0) return;

    const renderId = ++renderRef.current;

    // Calculate display dimensions that fit the container while preserving aspect ratio
    const imgAspect = image.naturalWidth / image.naturalHeight;
    const containerAspect = containerSize.width / containerSize.height;

    let displayWidth: number, displayHeight: number;
    if (imgAspect > containerAspect) {
      displayWidth = containerSize.width;
      displayHeight = containerSize.width / imgAspect;
    } else {
      displayHeight = containerSize.height;
      displayWidth = containerSize.height * imgAspect;
    }

    // Debounce renders
    const timeout = setTimeout(async () => {
      if (renderId !== renderRef.current) return;

      try {
        await renderWatermarkToCanvas(canvas, image, settings, displayWidth, displayHeight);
      } catch (err) {
        console.error('Render failed:', err);
      }
    }, 16); // ~60fps target

    return () => clearTimeout(timeout);
  }, [image, settings, containerSize, canvasRef]);

  // Calculate CSS display size
  const imgAspect = image.naturalWidth / image.naturalHeight;
  const containerAspect =
    containerSize.width && containerSize.height
      ? containerSize.width / containerSize.height
      : 1;

  let cssWidth = '100%';
  let cssHeight = '100%';
  if (containerSize.width > 0 && containerSize.height > 0) {
    if (imgAspect > containerAspect) {
      cssWidth = '100%';
      cssHeight = 'auto';
    } else {
      cssWidth = 'auto';
      cssHeight = '100%';
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[260px] flex items-center justify-center overflow-hidden select-none"
      style={{ touchAction: zoom > 1.0 ? 'none' : 'auto' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Zoomed & Panned Canvas Viewport */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0, 0, 0.2, 1)',
          cursor: zoom > 1.0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <canvas
          ref={canvasRef as React.LegacyRef<HTMLCanvasElement>}
          style={{
            width: cssWidth,
            height: cssHeight,
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Floating Zoom Controls Bar */}
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
