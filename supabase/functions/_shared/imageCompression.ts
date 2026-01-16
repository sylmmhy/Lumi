export interface ImageCompressionOptions {
    targetSizeKB?: number;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  }

  export interface CompressedImageResult {
    compressedDataUrl: string;
    originalSizeKB: number;
    compressedSizeKB: number;
    compressionRatio: number;
    dimensions: { width: number; height: number };
  }

  /**
   * Compress base64 image for optimal task detection
   * Optimized for 5-minute intervals with reduced file sizes
   */
  export async function compressImageForTaskDetection(
    imageB64: string,
    options: ImageCompressionOptions = {}
  ): Promise<CompressedImageResult> {
    const {
      targetSizeKB = 500,
      maxWidth = 800,
      maxHeight = 600,
      quality = 0.7,
      format = 'jpeg'
    } = options;

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        try {
          // Calculate optimal dimensions for task detection
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
          const newWidth = Math.floor(img.width * ratio);
          const newHeight = Math.floor(img.height * ratio);

          canvas.width = newWidth;
          canvas.height = newHeight;

          // Draw resized image
          ctx.drawImage(img, 0, 0, newWidth, newHeight);

          // Progressive compression until target size
          let currentQuality = quality;
          let compressedDataUrl = canvas.toDataURL(`image/${format}`, currentQuality);

          // Calculate original size
          const originalSizeKB = Math.round(imageB64.length / 1024);

          // Compress until target size or minimum quality
          while (compressedDataUrl.length > targetSizeKB * 1024 && currentQuality > 0.1) {
            currentQuality -= 0.1;
            compressedDataUrl = canvas.toDataURL(`image/${format}`, currentQuality);
          }

          const compressedSizeKB = Math.round(compressedDataUrl.length / 1024);
          const compressionRatio = originalSizeKB / compressedSizeKB;

          resolve({
            compressedDataUrl,
            originalSizeKB,
            compressedSizeKB,
            compressionRatio,
            dimensions: { width: newWidth, height: newHeight }
          });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageB64;
    });
  }

  /**
   * Generate content hash for caching
   */
  export async function generateImageHash(imageB64: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(imageB64);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Convert data URL to Blob (reused from existing code)
   */
  export function dataUrlToBlob(dataUrl: string): Blob {
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/data:(.+);base64/)?.[1] || 'image/jpeg';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    return new Blob([bytes], { type: mime });
  }
