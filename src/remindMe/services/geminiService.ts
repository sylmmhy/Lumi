import { supabase } from '../../lib/supabase'


// --- Helper Functions for Audio Encoding/Decoding ---

/**
 * 将音频字节编码为 Base64 字符串，便于通过 Gemini 传输。
 *
 * @param {Uint8Array} bytes - 原始 PCM 音频数据
 * @returns {string} 编码后的 Base64 字符串
 */
export function encode(bytes: Uint8Array) {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 将 Base64 字符串还原为 Uint8Array，方便进一步解码或播放。
 *
 * @param {string} base64 - Base64 编码的音频数据
 * @returns {Uint8Array} 解析后的字节数组
 */
export function decode(base64: string) {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * 将 Gemini 返回的 Int16 PCM 数据转换为可播放的 AudioBuffer。
 *
 * @param {Uint8Array} data - 原始 PCM 字节
 * @param {AudioContext} ctx - 复用的浏览器音频上下文
 * @param {number} sampleRate - 音频采样率
 * @param {number} numChannels - 音频声道数
 * @returns {Promise<AudioBuffer>} 可直接播放或进一步处理的音频缓冲
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer)
  const frameCount = dataInt16.length / numChannels
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate)

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel)
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0
    }
  }
  return buffer
}

// --- AI Functions ---



/**
 * 请求 Gemini 推荐任务的最佳时间，并返回推荐时间与原因。
 *
 * @param {string} taskDescription - 任务描述
 * @param {{ time: string; text: string }[]} [existingTasks=[]] - 已存在的任务列表，用于避免冲突
 * @returns {Promise<{ time: string; reason: string }>} 推荐的时间和简短理由
 */
/**
 * 请求 Gemini 推荐任务的最佳时间，并返回推荐时间与原因。
 *
 * @param {string} taskDescription - 任务描述
 * @param {{ time: string; text: string }[]} [existingTasks=[]] - 已存在的任务列表，用于避免冲突
 * @returns {Promise<{ time: string; reason: string }>} 推荐的时间和简短理由
 */
export const suggestTimeForTask = async (
  taskDescription: string,
  existingTasks: { time: string; text: string }[] = [],
): Promise<{ time: string; reason: string }> => {
  try {
    if (!supabase) throw new Error('Supabase client not initialized')

    const { data, error } = await supabase.functions.invoke('suggest-task-time', {
      body: {
        taskDescription,
        existingTasks,
      },
    })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error suggesting time:', error)
    // Fallback to current time + 1 hour
    const now = new Date()
    now.setHours(now.getHours() + 1)
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return { time: timeString, reason: 'Fallback due to connection error' }
  }
}
