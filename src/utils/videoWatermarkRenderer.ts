// ============================================================
// Video Watermark Renderer
// High-speed, mobile-friendly client-side video export engine.
// Primary: WebCodecs (VideoEncoder/AudioEncoder) + mp4-muxer
// Fallback: MediaRecorder (canvas.captureStream + video audio)
// ============================================================
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { WatermarkSettings } from '@/types';
import { formatTimemarkFilename } from '@/types';
import { drawWatermarkOnly } from './watermarkRenderer';
import { loadFonts } from './fontLoader';

export interface VideoRenderOptions {
  videoFile: File;
  settings: WatermarkSettings;
  onProgress?: (progress: number, statusText: string) => void;
  signal?: AbortSignal;
}

export interface VideoRenderResult {
  blob: Blob;
  filename: string;
}

/**
 * Main entry point: Renders the video with dynamic ticking Timemark watermark.
 * Preserves original resolution, frame rate, and audio.
 */
export async function renderVideoWatermark(
  options: VideoRenderOptions
): Promise<VideoRenderResult> {
  const { videoFile, settings, onProgress, signal } = options;
  const outputFilename = formatTimemarkFilename(settings.dateTime, 'video');

  await loadFonts();

  // Try WebCodecs + mp4-muxer first for fast, exact MP4 export
  if (
    typeof window !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  ) {
    try {
      const blob = await renderWithWebCodecs(videoFile, settings, onProgress, signal);
      return { blob, filename: outputFilename };
    } catch (err: any) {
      if (signal?.aborted || err?.message?.includes('cancelled')) {
        throw new Error('Đã hủy xuất video');
      }
      console.warn('WebCodecs rendering failed, falling back to MediaRecorder:', err);
    }
  }

  // Universal Fallback: MediaRecorder
  const { blob, ext } = await renderWithMediaRecorder(videoFile, settings, onProgress, signal);
  return {
    blob,
    filename: ext === 'mp4' ? outputFilename : outputFilename.replace(/\.mp4$/, `.${ext}`),
  };
}

/**
 * Primary Engine: WebCodecs VideoEncoder + AudioEncoder + mp4-muxer
 */
async function renderWithWebCodecs(
  videoFile: File,
  settings: WatermarkSettings,
  onProgress?: (progress: number, statusText: string) => void,
  signal?: AbortSignal
): Promise<Blob> {
  onProgress?.(2, 'Đang chuẩn bị bộ giải mã video...');

  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Không thể đọc dữ liệu video'));
    });

    const origW = video.videoWidth || 1280;
    const origH = video.videoHeight || 720;
    // H.264 codecs require even dimensions
    const encWidth = origW % 2 === 0 ? origW : origW - 1;
    const encHeight = origH % 2 === 0 ? origH : origH - 1;
    const duration = video.duration || 1;
    const fps = 30;
    const totalFrames = Math.max(1, Math.round(duration * fps));

    // 1. Extract audio data if present
    let audioBuffer: AudioBuffer | null = null;
    let hasAudioEncoder = false;
    let audioConfig = { numberOfChannels: 2, sampleRate: 48000 };

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const arrayBuf = await videoFile.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        await audioCtx.close();

        if (audioBuffer && typeof AudioEncoder !== 'undefined') {
          audioConfig = {
            numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
            sampleRate: audioBuffer.sampleRate,
          };
          const supported = await AudioEncoder.isConfigSupported({
            codec: 'mp4a.40.2',
            numberOfChannels: audioConfig.numberOfChannels,
            sampleRate: audioConfig.sampleRate,
          });
          hasAudioEncoder = supported.supported || false;
        }
      }
    } catch {
      // Audio extraction is optional (e.g. muted clip)
    }

    // 2. Setup mp4-muxer
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: encWidth,
        height: encHeight,
        frameRate: fps,
      },
      audio:
        hasAudioEncoder && audioBuffer
          ? {
              codec: 'aac',
              numberOfChannels: audioConfig.numberOfChannels,
              sampleRate: audioConfig.sampleRate,
            }
          : undefined,
      fastStart: 'in-memory',
    });

    // 3. Setup VideoEncoder
    let encoderError: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
        console.error('VideoEncoder error:', e);
      },
    });

    // Determine bitrate based on resolution
    const pixelCount = encWidth * encHeight;
    const targetBitrate = Math.min(12_000_000, Math.max(2_500_000, pixelCount * 4));

    videoEncoder.configure({
      codec: 'avc1.42001f', // H.264 Baseline
      width: encWidth,
      height: encHeight,
      bitrate: targetBitrate,
      framerate: fps,
    });

    // 4. Setup AudioEncoder if audio is supported
    let audioEncoder: AudioEncoder | null = null;
    if (hasAudioEncoder && audioBuffer) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error:', e),
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: audioConfig.numberOfChannels,
        sampleRate: audioConfig.sampleRate,
        bitrate: 128_000,
      });
    }

    // 5. Canvas for drawing frame + Timemark watermark
    const canvas = document.createElement('canvas');
    canvas.width = encWidth;
    canvas.height = encHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D context');

    onProgress?.(5, 'Bắt đầu xử lý từng khung hình video...');

    // 6. Sequential frame rendering
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) {
        throw new Error('Đã hủy xuất video');
      }
      if (encoderError) {
        throw encoderError;
      }

      const frameTime = i / fps;
      video.currentTime = Math.min(Math.max(0, duration - 0.001), frameTime);

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      // Draw original video frame
      ctx.drawImage(video, 0, 0, encWidth, encHeight);

      // Real-time ticking timestamp: base time + elapsed seconds
      const frameDate = new Date(settings.dateTime.getTime() + Math.round(frameTime * 1000));
      const frameSettings: WatermarkSettings = { ...settings, dateTime: frameDate };

      // Draw Timemark watermark
      drawWatermarkOnly(ctx, frameSettings, encWidth, encHeight);

      // Encode VideoFrame
      const timestampUs = Math.round(frameTime * 1_000_000);
      const videoFrame = new VideoFrame(canvas, { timestamp: timestampUs });
      videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
      videoFrame.close();

      // Progress reporting (0% -> 85%)
      const pct = Math.round(5 + ((i + 1) / totalFrames) * 80);
      onProgress?.(pct, `Đang đóng dấu khung hình: ${i + 1}/${totalFrames} (${pct}%)`);

      // Yield event loop every 10 frames
      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    onProgress?.(88, 'Đang hoàn tất nén video...');
    await videoEncoder.flush();
    videoEncoder.close();

    // 7. Encode audio track if present
    if (audioEncoder && audioBuffer) {
      onProgress?.(92, 'Đang đồng bộ âm thanh gốc...');
      const channels = audioConfig.numberOfChannels;
      const sampleRate = audioConfig.sampleRate;
      const length = audioBuffer.length;
      const chunkSize = 4096; // 4096 samples per audio packet

      for (let offset = 0; offset < length; offset += chunkSize) {
        if (signal?.aborted) throw new Error('Đã hủy xuất video');

        const currentChunkSize = Math.min(chunkSize, length - offset);
        const audioData = new Float32Array(currentChunkSize * channels);

        for (let ch = 0; ch < channels; ch++) {
          const chData = audioBuffer.getChannelData(ch);
          for (let s = 0; s < currentChunkSize; s++) {
            audioData[s * channels + ch] = chData[offset + s];
          }
        }

        const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
        const audioFrame = new AudioData({
          format: 'f32',
          numberOfChannels: channels,
          numberOfFrames: currentChunkSize,
          sampleRate: sampleRate,
          timestamp: timestampUs,
          data: audioData,
        });

        audioEncoder.encode(audioFrame);
        audioFrame.close();
      }

      await audioEncoder.flush();
      audioEncoder.close();
    }

    muxer.finalize();
    onProgress?.(100, 'Hoàn thành!');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

/**
 * Universal Browser Fallback: MediaRecorder
 * Combines canvas.captureStream with the video's live audio track.
 */
async function renderWithMediaRecorder(
  videoFile: File,
  settings: WatermarkSettings,
  onProgress?: (progress: number, statusText: string) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; ext: string }> {
  onProgress?.(5, 'Đang chuẩn bị ghi video (Universal Mode)...');

  const videoUrl = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.playsInline = true;
  video.muted = false; // Keep audio active for recording
  video.volume = 1.0;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Không thể đọc dữ liệu video'));
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const duration = video.duration || 1;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo Canvas');

    // Setup combined stream
    const canvasStream = canvas.captureStream(30);
    let combinedStream: MediaStream = canvasStream;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination); // Required for audio to flow

        dest.stream.getAudioTracks().forEach((track) => {
          canvasStream.addTrack(track);
        });
        combinedStream = canvasStream;
      }
    } catch {
      // Audio capture failed or clip is silent, continue with video only
    }

    // Determine supported mime type
    let mimeType = 'video/mp4';
    let ext = 'mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
        ext = 'webm';
      } else {
        mimeType = 'video/webm';
        ext = 'webm';
      }
    }

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    const completionPromise = new Promise<{ blob: Blob; ext: string }>((resolve, reject) => {
      recorder.onstop = () => {
        const finalBlob = new Blob(recordedChunks, { type: mimeType });
        resolve({ blob: finalBlob, ext });
      };
      recorder.onerror = (e) => reject(e);
    });

    recorder.start(200);

    // Render loop
    let animId: number;
    const renderLoop = () => {
      if (signal?.aborted) {
        cancelAnimationFrame(animId);
        recorder.stop();
        video.pause();
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);

      // Ticking watermark timestamp
      const frameDate = new Date(settings.dateTime.getTime() + Math.round(video.currentTime * 1000));
      drawWatermarkOnly(ctx, { ...settings, dateTime: frameDate }, width, height);

      const progress = Math.min(98, Math.round((video.currentTime / duration) * 100));
      onProgress?.(progress, `Đang xử lý video: ${progress}%`);

      if (!video.ended && !video.paused) {
        animId = requestAnimationFrame(renderLoop);
      }
    };

    await video.play();
    animId = requestAnimationFrame(renderLoop);

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
    });

    cancelAnimationFrame(animId);
    recorder.stop();
    onProgress?.(100, 'Hoàn thành!');

    return await completionPromise;
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}
