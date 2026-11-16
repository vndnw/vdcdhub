'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { WatermarkSettings } from '@/types';
import { renderWatermarkToCanvas } from '@/utils/watermarkRenderer';

interface CanvasPreviewProps {
  image: HTMLImageElement;
  settings: WatermarkSettings;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export default function CanvasPreview({ image, settings, canvasRef }: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const renderRef = useRef(0);

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
    <div ref={containerRef} className="canvas-container w-full h-full min-h-[300px]">
      <canvas
        ref={canvasRef as React.LegacyRef<HTMLCanvasElement>}
        style={{
          width: cssWidth,
          height: cssHeight,
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
