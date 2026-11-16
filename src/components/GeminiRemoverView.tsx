'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  RotateCcw,
  Download,
  Paintbrush,
  Scan,
  Undo2,
  Trash2,
  Check,
  Eye,
  Sliders,
  ZoomIn,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import {
  getAutoWatermarkBox,
  createBoxMask,
  inpaintImage,
  BoundingBox,
  AutoRegionSize,
} from '@/utils/watermarkRemover';
import { exportCanvasAsBlob, downloadBlob } from '@/utils/watermarkRenderer';

type ToolMode = 'auto' | 'brush';

export default function GeminiRemoverView() {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');

  // Mode: Auto vs Brush
  const [mode, setMode] = useState<ToolMode>('auto');

  // Auto mode settings
  const [regionSize, setRegionSize] = useState<AutoRegionSize>('medium');
  const [customScale, setCustomScale] = useState<number>(1.0);
  const [showBoundingBox, setShowBoundingBox] = useState<boolean>(true);

  // Brush mode settings
  const [brushSize, setBrushSize] = useState<number>(36);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [brushHistory, setBrushHistory] = useState<ImageData[]>([]);

  // Inpainted result
  const [cleanedCanvas, setCleanedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  // Before/After comparison
  const [sliderPos, setSliderPos] = useState<number>(50); // percentage 0 to 100
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const [zoomToCorner, setZoomToCorner] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg'>('png');

  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------
  // File Upload Handlers
  // -------------------------------------------------------------
  const handleFile = useCallback((file: File) => {
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!isImage) {
      alert('Please upload a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    setFileName(file.name.replace(/\.[^.]+$/, ''));
    setFileSize(formatFileSize(file.size));

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setOriginalImage(img);
      setCleanedCanvas(null);
      setBrushHistory([]);
    };
    img.src = url;
  }, []);

  // When image loads, initialize the source canvas
  useEffect(() => {
    if (!originalImage) return;

    const canvas = document.createElement('canvas');
    canvas.width = originalImage.naturalWidth;
    canvas.height = originalImage.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(originalImage, 0, 0);
    sourceCanvasRef.current = canvas;

    // Also initialize brush canvas
    if (brushCanvasRef.current) {
      brushCanvasRef.current.width = originalImage.naturalWidth;
      brushCanvasRef.current.height = originalImage.naturalHeight;
      const bCtx = brushCanvasRef.current.getContext('2d')!;
      bCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Automatically trigger initial auto-removal
    runAutoRemoval(canvas, regionSize, customScale);
  }, [originalImage]);

  // -------------------------------------------------------------
  // Inpainting Triggers
  // -------------------------------------------------------------
  const runAutoRemoval = useCallback(
    async (
      sourceCanvas: HTMLCanvasElement,
      size: AutoRegionSize,
      scale: number
    ) => {
      setIsProcessing(true);
      setProgress(10);

      try {
        const box = getAutoWatermarkBox(
          sourceCanvas.width,
          sourceCanvas.height,
          size,
          scale
        );
        const mask = createBoxMask(sourceCanvas.width, sourceCanvas.height, box);

        // Small timeout to allow UI loading state to paint
        await new Promise((r) => setTimeout(r, 20));

        const result = await inpaintImage(sourceCanvas, mask, (pct) => {
          setProgress(pct);
        });

        setCleanedCanvas(result);
      } catch (err) {
        console.error('Inpainting failed:', err);
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    },
    []
  );

  const handleApplyBrushInpainting = useCallback(async () => {
    const src = sourceCanvasRef.current;
    const brush = brushCanvasRef.current;
    if (!src || !brush) return;

    const bCtx = brush.getContext('2d')!;
    const brushData = bCtx.getImageData(0, 0, brush.width, brush.height).data;

    // Check if user painted anything
    let paintedCount = 0;
    const mask = new Uint8Array(brush.width * brush.height);
    for (let i = 0; i < mask.length; i++) {
      if (brushData[i * 4 + 3] > 10) {
        mask[i] = 255;
        paintedCount++;
      }
    }

    if (paintedCount === 0) {
      alert('Please paint over the watermark logo first using the brush tool.');
      return;
    }

    setIsProcessing(true);
    setProgress(10);

    try {
      await new Promise((r) => setTimeout(r, 20));
      const result = await inpaintImage(src, mask, (pct) => setProgress(pct));
      setCleanedCanvas(result);
      // Clear brush mask after applying
      bCtx.clearRect(0, 0, brush.width, brush.height);
      setBrushHistory([]);
    } catch (err) {
      console.error('Inpainting error:', err);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  }, []);

  // Update auto removal when region size changes
  const handleRegionChange = (newSize: AutoRegionSize) => {
    setRegionSize(newSize);
    if (sourceCanvasRef.current && mode === 'auto') {
      runAutoRemoval(sourceCanvasRef.current, newSize, customScale);
    }
  };

  const handleScaleChange = (newScale: number) => {
    setCustomScale(newScale);
    if (sourceCanvasRef.current && mode === 'auto') {
      runAutoRemoval(sourceCanvasRef.current, regionSize, newScale);
    }
  };

  // -------------------------------------------------------------
  // Manual Brush Canvas Drawing
  // -------------------------------------------------------------
  const saveBrushState = () => {
    const brush = brushCanvasRef.current;
    if (!brush) return;
    const bCtx = brush.getContext('2d')!;
    const snapshot = bCtx.getImageData(0, 0, brush.width, brush.height);
    setBrushHistory((prev) => [...prev.slice(-10), snapshot]);
  };

  const handleUndoBrush = () => {
    const brush = brushCanvasRef.current;
    if (!brush || brushHistory.length === 0) return;
    const bCtx = brush.getContext('2d')!;
    const nextHistory = [...brushHistory];
    const prevSnapshot = nextHistory.pop();
    setBrushHistory(nextHistory);

    if (prevSnapshot) {
      bCtx.putImageData(prevSnapshot, 0, 0);
    } else {
      bCtx.clearRect(0, 0, brush.width, brush.height);
    }
  };

  const handleClearBrush = () => {
    const brush = brushCanvasRef.current;
    if (!brush) return;
    const bCtx = brush.getContext('2d')!;
    bCtx.clearRect(0, 0, brush.width, brush.height);
    setBrushHistory([]);
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = brushCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'brush') return;
    saveBrushState();
    setIsDrawing(true);
    draw(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== 'brush') return;
    const brush = brushCanvasRef.current;
    if (!brush) return;
    const bCtx = brush.getContext('2d')!;
    const coords = getCanvasCoords(e);

    bCtx.fillStyle = 'rgba(239, 68, 68, 0.45)'; // Semi-transparent red mask
    bCtx.beginPath();
    bCtx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
    bCtx.fill();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // -------------------------------------------------------------
  // Split Slider Touch / Mouse Drag
  // -------------------------------------------------------------
  const handleSliderMove = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pos = ((clientX - rect.left) / rect.width) * 100;
      setSliderPos(Math.max(0, Math.min(100, pos)));
    },
    []
  );

  const handleMouseDown = () => setIsDraggingSlider(true);

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingSlider(false);
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSlider) {
        handleSliderMove(e.clientX);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDraggingSlider, handleSliderMove]);

  // -------------------------------------------------------------
  // Export Download
  // -------------------------------------------------------------
  const handleDownload = async () => {
    const canvas = cleanedCanvas || sourceCanvasRef.current;
    if (!canvas) return;

    const mime = exportFormat === 'png' ? 'image/png' : 'image/jpeg';
    const ext = exportFormat === 'png' ? 'png' : 'jpg';

    canvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, `${fileName || 'image'}_clean.${ext}`);
        }
      },
      mime,
      0.95
    );
  };

  const handleReset = () => {
    setOriginalImage(null);
    setCleanedCanvas(null);
    setBrushHistory([]);
    setFileName('');
  };

  // -------------------------------------------------------------
  // Render: Upload View
  // -------------------------------------------------------------
  if (!originalImage) {
    return (
      <div className="flex items-center justify-center min-h-[75vh] p-6 fade-in">
        <div className="w-full max-w-xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Sparkles size={24} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Gemini <span className="text-purple-400">Watermark Remover</span>
              </h1>
            </div>
            <p className="text-neutral-400 text-sm max-w-md mx-auto">
              Remove the Gemini AI watermark star from the bottom-right corner of your images.
              100% client-side inpainting preserves full original resolution.
            </p>
          </div>

          <div
            className="drop-zone p-12 text-center cursor-pointer border-2 border-dashed border-neutral-700 hover:border-purple-500 rounded-2xl bg-editor-surface/60 transition-all hover:bg-editor-surface"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Upload size={30} />
              </div>
              <div>
                <p className="text-white font-medium mb-1">Upload AI image</p>
                <p className="text-neutral-500 text-sm">
                  Drag & drop or browse • JPG, PNG, WEBP
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate bounding box for visual overlay
  const autoBox: BoundingBox = getAutoWatermarkBox(
    originalImage.naturalWidth,
    originalImage.naturalHeight,
    regionSize,
    customScale
  );

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col lg:flex-row overflow-hidden fade-in">
      {/* ---------------- Left Canvas Viewport ---------------- */}
      <div className="flex-1 flex flex-col overflow-hidden bg-editor-bg">
        {/* Top bar controls */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-editor-border bg-editor-surface/30">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Interactive Comparison
            </span>
            <span className="text-xs text-neutral-500">
              {originalImage.naturalWidth} × {originalImage.naturalHeight} • {fileSize}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomToCorner((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                zoomToCorner
                  ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                  : 'bg-editor-surface border-editor-border text-neutral-400 hover:text-white'
              }`}
              title="Zoom in on bottom-right watermark corner"
            >
              <ZoomIn size={14} />
              {zoomToCorner ? 'Fit View' : 'Inspect Corner'}
            </button>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white bg-editor-surface border border-editor-border transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={14} />
              New Photo
            </button>
          </div>
        </div>

        {/* Main interactive split-screen canvas area */}
        <div className="flex-1 relative p-4 flex items-center justify-center overflow-hidden">
          {/* Processing overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-3">
              <Loader2 size={36} className="text-purple-400 animate-spin" />
              <div className="text-sm font-medium text-white">
                Inpainting watermark... {progress > 0 ? `${progress}%` : ''}
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className={`relative max-w-full max-h-full overflow-hidden rounded-xl border border-editor-border shadow-2xl select-none transition-transform duration-300 ${
              zoomToCorner ? 'scale-175 origin-bottom-right' : ''
            }`}
            style={{
              aspectRatio: `${originalImage.naturalWidth} / ${originalImage.naturalHeight}`,
            }}
          >
            {/* Background: Original Image (BEFORE) */}
            <img
              src={originalImage.src}
              alt="Original"
              className="w-full h-full object-contain pointer-events-none block"
            />

            {/* Foreground: Cleaned Image (AFTER) with clip-path for slider */}
            {cleanedCanvas && (
              <img
                src={cleanedCanvas.toDataURL()}
                alt="Cleaned"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{
                  clipPath: `inset(0 0 0 ${sliderPos}%)`,
                }}
              />
            )}

            {/* Auto Mode: Dashed bounding box overlay on bottom-right corner */}
            {mode === 'auto' && showBoundingBox && !cleanedCanvas && (
              <div
                className="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/10 pointer-events-none animate-pulse rounded-md"
                style={{
                  left: `${(autoBox.x / originalImage.naturalWidth) * 100}%`,
                  top: `${(autoBox.y / originalImage.naturalHeight) * 100}%`,
                  width: `${(autoBox.width / originalImage.naturalWidth) * 100}%`,
                  height: `${(autoBox.height / originalImage.naturalHeight) * 100}%`,
                }}
              >
                <span className="absolute -top-5 right-0 text-[10px] font-bold bg-yellow-400 text-black px-1.5 py-0.5 rounded shadow">
                  Gemini Star
                </span>
              </div>
            )}

            {/* Brush Mode: Interactive Canvas Overlay */}
            {mode === 'brush' && (
              <canvas
                ref={brushCanvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="absolute inset-0 w-full h-full cursor-crosshair z-10"
              />
            )}

            {/* Split comparison divider line & handle */}
            {cleanedCanvas && (
              <>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.8)] z-20 pointer-events-none"
                  style={{ left: `${sliderPos}%` }}
                />
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-black shadow-lg flex items-center justify-center cursor-ew-resize z-20 hover:scale-110 active:scale-95 transition-transform"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="flex gap-0.5">
                    <div className="w-0.5 h-3 bg-neutral-600 rounded-full" />
                    <div className="w-0.5 h-3 bg-neutral-600 rounded-full" />
                  </div>
                </div>

                {/* Floating Before/After labels */}
                <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-semibold text-neutral-300 pointer-events-none z-10">
                  BEFORE (Original)
                </div>
                <div className="absolute bottom-3 right-3 bg-purple-900/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-semibold text-purple-200 pointer-events-none z-10">
                  AFTER (Cleaned)
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick Slider Range bar at bottom */}
        {cleanedCanvas && (
          <div className="flex items-center gap-4 px-6 py-2.5 bg-editor-surface/40 border-t border-editor-border">
            <span className="text-xs text-neutral-400 font-medium">Original</span>
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPos}
              onChange={(e) => setSliderPos(parseFloat(e.target.value))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs text-purple-400 font-medium">Cleaned</span>
          </div>
        )}
      </div>

      {/* ---------------- Right Sidebar Control Panel ---------------- */}
      <div className="lg:w-[360px] xl:w-[400px] border-t lg:border-t-0 lg:border-l border-editor-border bg-editor-surface/20 flex flex-col justify-between overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Mode Switcher */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Removal Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('auto')}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
                  mode === 'auto'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                    : 'bg-editor-surface text-neutral-400 border-editor-border hover:text-white'
                }`}
              >
                <Scan size={15} />
                Auto Bottom-Right
              </button>
              <button
                onClick={() => setMode('brush')}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all ${
                  mode === 'brush'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                    : 'bg-editor-surface text-neutral-400 border-editor-border hover:text-white'
                }`}
              >
                <Paintbrush size={15} />
                Manual Brush
              </button>
            </div>
          </div>

          {/* AUTO MODE SETTINGS */}
          {mode === 'auto' && (
            <div className="space-y-4 fade-in">
              <div className="control-section">
                <div className="control-section-title flex items-center gap-2">
                  <Scan size={14} className="text-purple-400" />
                  Auto Corner Preset
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {(['small', 'medium', 'large'] as AutoRegionSize[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => handleRegionChange(size)}
                      className={`py-2 text-xs rounded-lg font-medium capitalize border transition-all ${
                        regionSize === size
                          ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                          : 'border-editor-border bg-editor-surface text-neutral-400 hover:text-white'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                {/* Fine-tune Scale */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-400 mb-1">
                    <span>Target Box Scale</span>
                    <span>{Math.round(customScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.6"
                    step="0.05"
                    value={customScale}
                    onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-editor-border">
                  <span className="text-xs text-neutral-300">Show target box</span>
                  <input
                    type="checkbox"
                    checked={showBoundingBox}
                    onChange={(e) => setShowBoundingBox(e.target.checked)}
                    className="accent-purple-500 rounded"
                  />
                </div>
              </div>

              {/* Re-run button */}
              <button
                onClick={() => {
                  if (sourceCanvasRef.current) {
                    runAutoRemoval(sourceCanvasRef.current, regionSize, customScale);
                  }
                }}
                disabled={isProcessing}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-purple-600/20 border border-purple-500 text-purple-300 hover:bg-purple-600/30 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles size={14} />
                Re-apply Clean Algorithm
              </button>
            </div>
          )}

          {/* MANUAL BRUSH MODE SETTINGS */}
          {mode === 'brush' && (
            <div className="space-y-4 fade-in">
              <div className="control-section">
                <div className="control-section-title flex items-center gap-2">
                  <Paintbrush size={14} className="text-purple-400" />
                  Brush Mask Controls
                </div>

                <p className="text-xs text-neutral-400 mb-3">
                  Click and drag over any watermark or logo to paint a removal mask.
                </p>

                {/* Brush Size Slider */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-neutral-400 mb-1">
                    <span>Brush Diameter</span>
                    <span>{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="120"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-full accent-purple-500"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleUndoBrush}
                    disabled={brushHistory.length === 0}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-editor-surface border border-editor-border text-neutral-300 hover:text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Undo2 size={13} />
                    Undo
                  </button>
                  <button
                    onClick={handleClearBrush}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-editor-surface border border-editor-border text-red-400 hover:text-red-300 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    Clear
                  </button>
                </div>
              </div>

              {/* Apply Inpaint button */}
              <button
                onClick={handleApplyBrushInpainting}
                disabled={isProcessing}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={15} />
                Remove Masked Watermark
              </button>
            </div>
          )}

          {/* Export Settings */}
          <div className="control-section">
            <div className="control-section-title">Output Format</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setExportFormat('png')}
                className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                  exportFormat === 'png'
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300 font-semibold'
                    : 'border-editor-border bg-editor-surface text-neutral-400'
                }`}
              >
                PNG (Lossless)
              </button>
              <button
                onClick={() => setExportFormat('jpg')}
                className={`py-2 text-xs font-medium rounded-lg border transition-all ${
                  exportFormat === 'jpg'
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300 font-semibold'
                    : 'border-editor-border bg-editor-surface text-neutral-400'
                }`}
              >
                JPG (95% Quality)
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Download Bar */}
        <div className="p-5 border-t border-editor-border bg-editor-surface/40">
          <button
            onClick={handleDownload}
            disabled={isProcessing}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download size={18} />
            Download Clean Image
          </button>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
