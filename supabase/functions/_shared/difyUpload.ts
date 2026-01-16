import { dataUrlToBlob } from './imageCompression.ts';
import { fetchWithTimeout } from './fetchWithTimeout.ts';

export interface DifyUploadOptions {
  difyApiUrl: string;
  difyApiKey: string;
  userId: string;
  imageType: 'camera' | 'screen';
  maxSizeMB?: number;
}

export interface DifyUploadResult {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

/**
 * Upload compressed image to Dify with size validation
 * Shared utility for all functions that need image upload
 */
export async function uploadImageToDify(
  imageB64: string,
  options: DifyUploadOptions
): Promise<DifyUploadResult | null> {
  const {
    difyApiUrl,
    difyApiKey,
    userId,
    imageType,
    maxSizeMB = 3
  } = options;

  try {
    // Convert to blob and check size
    const imageBlob = dataUrlToBlob(imageB64);
    const sizeMB = imageBlob.size / (1024 * 1024);

    console.log(`📤 Uploading ${imageType} image to Dify - Size: ${sizeMB.toFixed(2)} MB`);

    // Size guard
    if (imageBlob.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`Image too large: ${sizeMB.toFixed(2)} MB (max ${maxSizeMB} MB)`);
    }

    // Upload to Dify
    const uploadUrl = `${difyApiUrl}/v1/files/upload`;
    const formData = new FormData();
    formData.append('file', imageBlob, `${imageType}-${Date.now()}.png`);
    formData.append('user', `user_${userId}`);

    const response = await fetchWithTimeout(uploadUrl, {
      timeoutMs: 15000,
      init: {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${difyApiKey}`
        },
        body: formData
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dify file upload failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ ${imageType} image uploaded successfully to Dify with ID: ${result.id}`);

    return {
      id: result.id,
      name: result.name || `${imageType}-${Date.now()}.png`,
      size: imageBlob.size,
      type: imageBlob.type,
      url: result.url
    };
  } catch (error) {
    console.error(`❌ Dify upload failed for ${imageType} image:`, error);
    return null;
  }
}
