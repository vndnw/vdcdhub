'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, RotateCcw, Loader2, Sparkles, Share2 } from 'lucide-react';
import { removeGeminiWatermarkAuto } from '@/utils/aiWatermarkRemover';
import { downloadBlob } from '@/utils/watermarkRenderer';

export default function GeminiAutoRemover() {
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [fullCanvas, setFullCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>('Đang xử lý AI...');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------
  // Process image file: immediate auto-removal
  // -------------------------------------------------------------
  const processImageFile = useCallback(async (file: File) => {
    const isImg = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!isImg) {
      alert('Vui lòng chọn file ảnh hợp lệ (JPG, PNG, WEBP).');
      return;
    }

    setFileName(file.name.replace(/\.[^.]+$/, ''));
    setIsProcessing(true);

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        // Instant 2-Pass Texture-Preserving Watermark Removal (<30ms, 0MB download)
        const result = await removeGeminiWatermarkAuto(img, 'default', false);
        setFullCanvas(result.fullCanvas);
        setCleanedUrl(result.fullCanvas.toDataURL('image/png'));
      } catch (err) {
        console.error('Removal failed:', err);
        alert('Không thể xử lý ảnh này. Vui lòng thử ảnh khác.');
      } finally {
        setIsProcessing(false);
      }
    };

    img.onerror = () => {
      setIsProcessing(false);
      alert('Không thể đọc file ảnh.');
    };

    img.src = url;
  }, []);

  // -------------------------------------------------------------
  // Global Clipboard Paste (Ctrl+V) Support
  // -------------------------------------------------------------
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processImageFile]);

  // -------------------------------------------------------------
  // Download Cleaned Image with Native Share fallback for Mobile
  // -------------------------------------------------------------
  const handleDownload = () => {
    if (!fullCanvas) return;

    fullCanvas.toBlob(
      async (blob) => {
        if (!blob) return;

        const outputName = `${fileName || 'gemini'}_clean.png`;

        // Mobile Web Share API support (Saves directly to iOS Camera Roll / Android Gallery)
        const file = new File([blob], outputName, { type: 'image/png' });
        if (
          typeof navigator !== 'undefined' &&
          navigator.canShare &&
          navigator.canShare({ files: [file] }) &&
          /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        ) {
          try {
            await navigator.share({
              files: [file],
              title: outputName,
            });
            return;
          } catch (shareErr: any) {
            if (shareErr.name === 'AbortError') return;
          }
        }

        // Standard direct download
        downloadBlob(blob, outputName);
      },
      'image/png'
    );
  };

  // Reset to Upload Box
  const handleReset = () => {
    setCleanedUrl(null);
    setFullCanvas(null);
    setFileName('');
  };

  // -------------------------------------------------------------
  // 1. EMPTY STATE: Minimal Mobile-First Upload Box
  // -------------------------------------------------------------
  if (!cleanedUrl && !isProcessing) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-48px)] p-4 sm:p-6 fade-in overscroll-none">
        <div className="w-full max-w-md text-center">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/25 mb-3">
              <Sparkles size={22} className="text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1.5">
              Xóa Logo Gemini
            </h1>
            <p className="text-neutral-400 text-xs sm:text-sm max-w-xs mx-auto">
              Tự động xóa ngôi sao watermark ở góc dưới phải. Giữ nguyên 100% độ nét ảnh gốc.
            </p>
          </div>

          {/* Centered Large Tap-Friendly Upload Area */}
          <div
            className={`p-8 sm:p-12 text-center cursor-pointer border-2 border-dashed rounded-2xl min-h-[260px] flex flex-col items-center justify-center transition-all ${
              isDragging
                ? 'border-purple-500 bg-purple-500/15'
                : 'border-neutral-700 hover:border-purple-500 bg-editor-surface/40 hover:bg-editor-surface/70'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files[0]) processImageFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) processImageFile(e.target.files[0]);
              }}
            />

            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center text-purple-400 shadow-md">
                <Upload size={28} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm mb-1">
                  Chạm để chọn ảnh từ thư viện
                </p>
                <p className="text-neutral-500 text-xs">
                  hoặc kéo thả • Máy tính có thể nhấn <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-300 font-mono text-[10px]">Ctrl+V</kbd>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // PROCESSING STATE: Minimal Loading Spinner
  // -------------------------------------------------------------
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-48px)] p-6 fade-in">
        <div className="flex flex-col items-center gap-3 max-w-xs text-center">
          <Loader2 size={36} className="text-purple-400 animate-spin" />
          <p className="text-sm font-semibold text-white">Đang xóa logo tự động...</p>
          <p className="text-xs text-neutral-500">Instant 2-Pass Engine • Giữ nguyên 100% độ nét gốc</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. RESULT STATE: Mobile Viewport Fitted Preview + 2 Touch CTAs
  // -------------------------------------------------------------
  return (
    <div className="h-[calc(100dvh-48px)] flex flex-col justify-between p-3 sm:p-5 pb-[max(12px,env(safe-area-inset-bottom))] fade-in overflow-hidden">
      {/* Fitted Image Preview Container (fits in max 62dvh without page scroll) */}
      <div className="flex-1 flex items-center justify-center min-h-0 py-2">
        <div className="max-h-[62dvh] max-w-full rounded-2xl overflow-hidden border border-editor-border shadow-2xl bg-black/60 flex items-center justify-center">
          <img
            src={cleanedUrl!}
            alt="Cleaned"
            className="max-h-[62dvh] max-w-full object-contain block"
          />
        </div>
      </div>

      {/* Action Buttons: Stacked on small screens, side-by-side on tablet/desktop */}
      <div className="flex-none flex flex-col sm:flex-row items-center justify-center gap-2.5 max-w-sm sm:max-w-md mx-auto w-full pt-2">
        {/* Primary Download Button */}
        <button
          onClick={handleDownload}
          className="w-full sm:flex-1 py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-h-[48px]"
        >
          <Download size={18} />
          <span>Tải ảnh sạch về</span>
        </button>

        {/* Secondary Reset Button */}
        <button
          onClick={handleReset}
          className="w-full sm:w-auto py-3 px-5 rounded-xl text-sm font-semibold text-neutral-400 hover:text-white bg-editor-surface border border-editor-border active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 min-h-[48px]"
        >
          <RotateCcw size={15} />
          <span>Chọn ảnh khác</span>
        </button>
      </div>
    </div>
  );
}
