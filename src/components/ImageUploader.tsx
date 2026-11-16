'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, Image as ImageIcon, X } from 'lucide-react';

interface ImageUploaderProps {
  onImageLoad: (file: File, img: HTMLImageElement) => void;
}

export default function ImageUploader({ onImageLoad }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError('Ảnh quá lớn. Vui lòng chọn ảnh dưới 50MB.');
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        onImageLoad(file, img);
      };
      img.onerror = () => {
        setError('Không thể đọc file ảnh này. Vui lòng thử ảnh khác.');
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    [onImageLoad]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-48px)] p-4 sm:p-6 fade-in">
      <div className="w-full max-w-lg text-center">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-md shadow-accent/20">
              <ImageIcon size={20} className="text-black" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Time<span className="text-accent">mark</span>
            </h1>
          </div>
          <p className="text-neutral-400 text-xs sm:text-sm max-w-sm mx-auto">
            Đóng dấu ngày giờ, địa chỉ chính xác chuẩn Timemark lên ảnh.
            Xử lý 100% trên thiết bị của bạn.
          </p>
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone p-8 sm:p-12 text-center cursor-pointer min-h-[240px] flex flex-col items-center justify-center transition-all ${
            isDragging ? 'dragging' : 'hover:border-neutral-500 bg-editor-surface/40 hover:bg-editor-surface/70'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging ? 'bg-accent/20 text-accent' : 'bg-editor-surface text-neutral-400'
              }`}
            >
              <Upload size={26} />
            </div>

            <div>
              <p className="text-white font-medium text-sm mb-1">
                {isDragging ? 'Thả ảnh vào đây' : 'Nhấn để chọn ảnh từ máy'}
              </p>
              <p className="text-neutral-500 text-xs">
                hoặc kéo thả ảnh • Hỗ trợ JPG, PNG, WEBP, HEIC
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 text-xs text-red-400 fade-in">
            <X size={15} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
