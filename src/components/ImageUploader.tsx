'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, Film, Image as ImageIcon, X } from 'lucide-react';
import BrandLogo from './BrandLogo';

interface MediaUploaderProps {
  onImageLoad: (file: File, img: HTMLImageElement) => void;
  onVideoLoad: (file: File, video: HTMLVideoElement) => void;
}

export default function ImageUploader({ onImageLoad, onVideoLoad }: MediaUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      // Validate file size (max 200MB for video, 50MB for image)
      const isVideo =
        file.type.startsWith('video/') ||
        /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(file.name);

      const maxLimit = isVideo ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
      if (file.size > maxLimit) {
        setError(`Tệp quá lớn. Vui lòng chọn ${isVideo ? 'video dưới 200MB' : 'ảnh dưới 50MB'}.`);
        return;
      }

      const url = URL.createObjectURL(file);

      if (isVideo) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = () => {
          onVideoLoad(file, video);
        };
        video.onerror = () => {
          setError('Không thể đọc file video này. Vui lòng thử video khác (MP4, MOV, WEBM).');
          URL.revokeObjectURL(url);
        };
        video.src = url;
      } else {
        const img = new Image();
        img.onload = () => {
          onImageLoad(file, img);
        };
        img.onerror = () => {
          setError('Không thể đọc file ảnh này. Vui lòng thử ảnh khác.');
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    },
    [onImageLoad, onVideoLoad]
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
          <div className="inline-flex items-center gap-2.5 mb-3">
            <BrandLogo size={46} />
            <div className="flex items-center gap-1.5 font-black text-2xl sm:text-3xl tracking-tight">
              <span className="text-white">VDCD</span>
              <span className="inline-block px-2.5 py-0.5 rounded-lg text-lg sm:text-xl font-black text-[#111111] bg-[#F59E0B] shadow-sm transform -rotate-2 select-none">
                Húp
              </span>
            </div>
          </div>
          <p className="text-neutral-400 text-xs sm:text-sm max-w-sm mx-auto">
            Đóng dấu ngày giờ, địa chỉ chính xác chuẩn Timemark lên ảnh & video.
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
            accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm,.m4v"
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
                {isDragging ? 'Thả tệp vào đây' : 'Nhấn để chọn ảnh hoặc video từ máy'}
              </p>
              <p className="text-neutral-500 text-xs">
                hoặc kéo thả tệp • Hỗ trợ JPG, PNG, MP4, MOV, WEBM, HEIC
              </p>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-neutral-400">
                <ImageIcon size={10} /> Ảnh
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-accent/10 border border-accent/20 text-accent">
                <Film size={10} /> Video + Âm thanh
              </span>
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
