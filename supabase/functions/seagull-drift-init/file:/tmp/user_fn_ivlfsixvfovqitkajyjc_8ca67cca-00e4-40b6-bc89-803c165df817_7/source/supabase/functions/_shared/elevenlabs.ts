/*
# ElevenLabs TTS Integration Utility

This utility provides text-to-speech functionality using ElevenLabs API.
It's used by both FR-2.3 (Ask Seagull) and FR-2.4 (Deep Drift Intervention) features.

## Usage
- Import this utility in your edge functions
- Call convertTextToSpeech() with text and optional voice settings
- Returns audio data as base64 encoded string or stream

## Environment Variables Required
- ELEVENLABS_API_KEY: Your ElevenLabs API key
- ELEVENLABS_VOICE_ID: Voice ID to use (optional, defaults to Rachel)
*/ const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Rachel voice
const DEFAULT_MODEL_ID = 'eleven_monolingual_v1';
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true
};
export async function convertTextToSpeech(text, voiceId, modelId, voiceSettings) {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      error: 'ElevenLabs API key not configured'
    };
  }
  if (!text?.trim()) {
    return {
      success: false,
      error: 'Text is required for TTS conversion'
    };
  }
  // Retry logic for rate limiting
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  for(let attempt = 1; attempt <= maxRetries; attempt++){
    try {
      const requestBody = {
        text: text.trim(),
        model_id: modelId || DEFAULT_MODEL_ID,
        voice_settings: voiceSettings || DEFAULT_VOICE_SETTINGS
      };
      console.log(`🔊 ElevenLabs TTS Request (attempt ${attempt}/${maxRetries}):`, {
        text: text.substring(0, 100) + '...',
        voiceId: voiceId || DEFAULT_VOICE_ID,
        modelId: requestBody.model_id
      });
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify(requestBody)
      });
      if (response.status === 429) {
        // Rate limited - wait before retry
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.warn(`ElevenLabs rate limited (429), waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) {
          await new Promise((resolve)=>setTimeout(resolve, delay));
          continue;
        } else {
          return {
            success: false,
            error: 'ElevenLabs rate limit exceeded - please try again later'
          };
        }
      }
      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', response.status, errorText);
        return {
          success: false,
          error: `ElevenLabs API error: ${response.status} - ${errorText}`
        };
      }
      // Get audio data as ArrayBuffer
      const audioArrayBuffer = await response.arrayBuffer();
      console.log('✅ ElevenLabs TTS successful:', `${audioArrayBuffer.byteLength} bytes`);
      // Convert to base64 for easier transmission
      // Use chunked conversion to avoid stack overflow on large audio files
      const uint8Array = new Uint8Array(audioArrayBuffer);
      let binaryString = '';
      const chunkSize = 8192; // Process in 8KB chunks
      for(let i = 0; i < uint8Array.length; i += chunkSize){
        const end = Math.min(i + chunkSize, uint8Array.length);
        const chunk = uint8Array.subarray(i, end);
        // Convert chunk to string byte by byte to avoid stack overflow
        for(let j = 0; j < chunk.length; j++){
          binaryString += String.fromCharCode(chunk[j]);
        }
      }
      const audioBase64 = btoa(binaryString);
      return {
        success: true,
        audioData: audioBase64
      };
    } catch (error) {
      console.error(`ElevenLabs TTS error (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt === maxRetries) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown TTS error'
        };
      }
      // Wait before retry on network errors
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Retrying after error in ${delay}ms...`);
      await new Promise((resolve)=>setTimeout(resolve, delay));
    }
  }
  // Should never reach here, but just in case
  return {
    success: false,
    error: 'All retry attempts failed'
  };
}
export async function convertTextToSpeechStream(text, voiceId, modelId, voiceSettings) {
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) {
    console.error('ElevenLabs API key not configured');
    return null;
  }
  if (!text?.trim()) {
    console.error('Text is required for TTS conversion');
    return null;
  }
  try {
    const requestBody = {
      text: text.trim(),
      model_id: modelId || DEFAULT_MODEL_ID,
      voice_settings: voiceSettings || DEFAULT_VOICE_SETTINGS
    };
    console.log('🔊 ElevenLabs TTS Stream Request:', {
      text: text.substring(0, 100) + '...',
      voiceId: voiceId || DEFAULT_VOICE_ID,
      modelId: requestBody.model_id
    });
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs streaming API error:', response.status, errorText);
      return null;
    }
    console.log('✅ ElevenLabs TTS stream successful');
    return response.body;
  } catch (error) {
    console.error('ElevenLabs TTS streaming error:', error);
    return null;
  }
}
// Helper function to create audio data URL for frontend playback
export function createAudioDataURL(base64Audio) {
  return `data:audio/mpeg;base64,${base64Audio}`;
}
// Helper function to validate text length for TTS
export function validateTTSText(text, maxLength = 5000) {
  return text?.trim().length > 0 && text.trim().length <= maxLength;
}
