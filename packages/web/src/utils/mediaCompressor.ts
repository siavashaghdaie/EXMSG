/**
 * Client-side media compression utilities.
 * Compresses images before upload to reduce bandwidth and storage.
 */

interface CompressOptions {
  /** Max width/height in pixels (default 1920) */
  maxDimension?: number;
  /** JPEG quality 0-1 (default 0.82) */
  quality?: number;
  /** Max file size in bytes — will reduce quality to hit target (default 5MB) */
  maxFileSize?: number;
}

const DEFAULT_OPTIONS: Required<CompressOptions> = {
  maxDimension: 1920,
  quality: 0.82,
  maxFileSize: 5 * 1024 * 1024, // 5MB
};

/**
 * Returns true if the file is an image that can be compressed via canvas.
 */
export function isCompressibleImage(file: File): boolean {
  return /^image\/(jpeg|jpg|png|webp|bmp|tiff)$/i.test(file.type);
}

/**
 * Compress an image file using canvas.
 * - Resizes if larger than maxDimension
 * - Converts PNG/BMP to JPEG for smaller size
 * - Iteratively reduces quality if result exceeds maxFileSize
 *
 * Returns original file if it's already small enough or not compressible.
 */
export async function compressImage(
  file: File,
  options?: CompressOptions
): Promise<File> {
  // Skip non-compressible types
  if (!isCompressibleImage(file)) return file;

  // Skip already-small files (under 200KB)
  if (file.size < 200 * 1024) return file;

  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if needed
      if (width > opts.maxDimension || height > opts.maxDimension) {
        const ratio = Math.min(opts.maxDimension / width, opts.maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      } else if (file.size <= opts.maxFileSize) {
        // Image is within dimensions and size limits — return original
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Draw with smooth scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Determine output mime — use JPEG for best compression
      // Keep PNG only if the image has transparency AND is small
      const outputMime = 'image/jpeg';

      // Try to hit size target by reducing quality
      const tryCompress = (quality: number): void => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            if (blob.size > opts.maxFileSize && quality > 0.3) {
              // Still too large, reduce quality
              tryCompress(quality - 0.1);
              return;
            }

            // Build compressed file
            const ext = outputMime === 'image/jpeg' ? '.jpg' : '.png';
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const compressedFile = new File([blob], baseName + ext, {
              type: outputMime,
              lastModified: Date.now(),
            });

            console.log(
              `[MediaCompressor] ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (${width}x${height}, q=${quality.toFixed(2)})`
            );

            resolve(compressedFile);
          },
          outputMime,
          quality
        );
      };

      tryCompress(opts.quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fall back to original
    };

    img.src = url;
  });
}

/**
 * Compress a video file by re-encoding at a lower bitrate.
 * This uses the browser's MediaRecorder API — not all browsers support it.
 * Falls back to the original file if not supported.
 */
export async function compressVideo(
  file: File,
  maxSizeMB: number = 25
): Promise<File> {
  // If already under target, skip
  if (file.size <= maxSizeMB * 1024 * 1024) return file;

  // Check if MediaRecorder can re-encode
  if (typeof MediaRecorder === 'undefined') return file;

  return new Promise<File>((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.preload = 'auto';

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!duration || !isFinite(duration)) {
        URL.revokeObjectURL(url);
        resolve(file);
        return;
      }

      // Calculate target bitrate (bits/sec) for target size
      const targetBits = maxSizeMB * 8 * 1024 * 1024;
      const videoBitrate = Math.max(500000, Math.floor((targetBits / duration) * 0.9)); // 90% for overhead

      // Use canvas + MediaRecorder to re-encode
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(file);
        return;
      }

      const stream = canvas.captureStream(30);
      // Try to get audio track too
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch {
        // No audio or not supported — continue without
      }

      let mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        URL.revokeObjectURL(url);
        resolve(file);
        return;
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: videoBitrate,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        URL.revokeObjectURL(url);
        const blob = new Blob(chunks, { type: 'video/webm' });
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const compressed = new File([blob], baseName + '.webm', {
          type: 'video/webm',
          lastModified: Date.now(),
        });

        console.log(
          `[MediaCompressor] Video ${file.name}: ${(file.size / (1024 * 1024)).toFixed(1)}MB → ${(compressed.size / (1024 * 1024)).toFixed(1)}MB`
        );
        resolve(compressed);
      };

      recorder.start(100); // Collect data every 100ms
      video.currentTime = 0;
      video.play();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();

      video.onended = () => {
        setTimeout(() => recorder.stop(), 200);
      };

      // Safety timeout — don't let it run longer than 2x duration
      setTimeout(() => {
        if (recorder.state === 'recording') {
          video.pause();
          recorder.stop();
        }
      }, duration * 2000 + 5000);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    video.src = url;
  });
}

/**
 * Auto-compress a file based on its type.
 * Images → compressImage, Videos → compressVideo, Others → return as-is.
 */
export async function compressMedia(file: File): Promise<File> {
  if (isCompressibleImage(file)) {
    return compressImage(file);
  }
  if (file.type.startsWith('video/') && file.size > 25 * 1024 * 1024) {
    return compressVideo(file);
  }
  return file;
}
