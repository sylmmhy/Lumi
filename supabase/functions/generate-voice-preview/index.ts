/**
 * Generate Voice Preview Edge Function
 *
 * 使用 Gemini TTS API 为 AI 声音生成试听音频文件
 * 生成后存储到 Supabase Storage 的 voice-previews bucket
 *
 * 支持的声音: Puck, Kore, Zephyr
 *
 * @example POST /functions/v1/generate-voice-preview
 * Body: { "voiceName": "Puck", "regenerate": false }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// 支持的声音列表
const SUPPORTED_VOICES = ['Puck', 'Kore', 'Zephyr'] as const;
type VoiceName = typeof SUPPORTED_VOICES[number];

// 试听文本（英文）
const PREVIEW_TEXT = "Hi, I'm Lumi. Let me help you build good habits.";

/**
 * 使用 Gemini TTS API 生成语音
 * @param voiceName - 声音名称
 * @param text - 要转换的文本
 * @returns base64 编码的音频数据
 */
async function generateSpeech(voiceName: string, text: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // 使用 Gemini TTS API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: text
          }]
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName
              }
            }
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini TTS API error:', errorText);
    throw new Error(`Gemini TTS API error: ${response.status}`);
  }

  const data = await response.json();

  // 提取 base64 音频数据
  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) {
    console.error('Unexpected response structure:', JSON.stringify(data, null, 2));
    throw new Error('No audio data in response');
  }

  return audioData;
}

/**
 * 将 base64 音频数据转换为 WAV 格式的 ArrayBuffer
 * Gemini TTS 返回的是 PCM 数据，需要添加 WAV 头
 */
function pcmToWav(base64Pcm: string, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array {
  // 解码 base64
  const pcmData = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0));

  const dataLength = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // WAV 头
  // "RIFF"
  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);

  // 文件大小 - 8
  view.setUint32(4, 36 + dataLength, true);

  // "WAVE"
  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);

  // "fmt "
  view.setUint8(12, 0x66);
  view.setUint8(13, 0x6D);
  view.setUint8(14, 0x74);
  view.setUint8(15, 0x20);

  // fmt 块大小
  view.setUint32(16, 16, true);

  // 音频格式 (1 = PCM)
  view.setUint16(20, 1, true);

  // 声道数
  view.setUint16(22, channels, true);

  // 采样率
  view.setUint32(24, sampleRate, true);

  // 字节率
  view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true);

  // 块对齐
  view.setUint16(32, channels * bitsPerSample / 8, true);

  // 位深度
  view.setUint16(34, bitsPerSample, true);

  // "data"
  view.setUint8(36, 0x64);
  view.setUint8(37, 0x61);
  view.setUint8(38, 0x74);
  view.setUint8(39, 0x61);

  // 数据大小
  view.setUint32(40, dataLength, true);

  // PCM 数据
  const wavData = new Uint8Array(buffer);
  wavData.set(pcmData, 44);

  return wavData;
}

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // GET 请求返回所有声音的预览 URL
    if (req.method === 'GET') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

      const previewUrls: Record<string, string> = {};
      for (const voice of SUPPORTED_VOICES) {
        previewUrls[voice] = `${supabaseUrl}/storage/v1/object/public/voice-previews/${voice.toLowerCase()}-preview.wav`;
      }

      return new Response(
        JSON.stringify({ previews: previewUrls }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST 请求生成音频
    const { voiceName, regenerate = false } = await req.json();

    // 验证声音名称
    if (!voiceName || !SUPPORTED_VOICES.includes(voiceName)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid voice name',
          supported: SUPPORTED_VOICES
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 初始化 Supabase 客户端（使用 service role key 以便写入 storage）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const fileName = `${voiceName.toLowerCase()}-preview.wav`;

    // 检查文件是否已存在（除非强制重新生成）
    if (!regenerate) {
      const { data: existingFile } = await supabase.storage
        .from('voice-previews')
        .list('', { search: fileName });

      if (existingFile && existingFile.length > 0) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/voice-previews/${fileName}`;
        return new Response(
          JSON.stringify({
            message: 'Preview already exists',
            url: publicUrl,
            voiceName
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Generating preview for voice: ${voiceName}`);

    // 生成语音
    const base64Audio = await generateSpeech(voiceName, PREVIEW_TEXT);

    // 转换为 WAV
    const wavData = pcmToWav(base64Audio);

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('voice-previews')
      .upload(fileName, wavData, {
        contentType: 'audio/wav',
        upsert: true // 允许覆盖
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload: ${uploadError.message}`);
    }

    // 获取公开 URL
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/voice-previews/${fileName}`;

    console.log(`Successfully generated preview for ${voiceName}: ${publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        voiceName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating voice preview:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
