/**
 * AI Tone Settings - 管理用户的 AI 语气偏好
 *
 * 语气类型：
 * - gentle: 温柔鼓励
 * - direct: 直接了当
 * - humorous: 幽默搞笑
 * - tough_love: 毒舌损友
 */

import { supabase } from './supabase';

export type AITone = 'gentle' | 'direct' | 'humorous' | 'tough_love';

const STORAGE_KEY = 'lumi_ai_tone';

/**
 * AI 语气配置
 */
export interface AIToneConfig {
  id: AITone;
  icon: string;
  colorClass: string;
}

/**
 * 获取所有可用的 AI 语气
 */
export function getAvailableAITones(): AIToneConfig[] {
  return [
    {
      id: 'gentle',
      icon: 'fa-heart',
      colorClass: 'text-pink-500 bg-pink-50',
    },
    {
      id: 'direct',
      icon: 'fa-bullseye',
      colorClass: 'text-blue-500 bg-blue-50',
    },
    {
      id: 'humorous',
      icon: 'fa-face-laugh-squint',
      colorClass: 'text-yellow-500 bg-yellow-50',
    },
    {
      id: 'tough_love',
      icon: 'fa-fire-flame-curved',
      colorClass: 'text-red-500 bg-red-50',
    },
  ];
}

/**
 * 从本地存储获取 AI 语气偏好
 */
export function getAITone(): AITone {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidAITone(stored)) {
      return stored as AITone;
    }
  } catch (e) {
    console.warn('Failed to read AI tone from localStorage:', e);
  }
  return 'gentle'; // 默认值
}

/**
 * 设置 AI 语气偏好（本地存储 + 同步到服务器）
 */
export async function setAITone(tone: AITone, userId?: string): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, tone);
  } catch (e) {
    console.warn('Failed to save AI tone to localStorage:', e);
  }

  // 如果有用户 ID，同步到服务器
  if (userId && supabase) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ ai_tone: tone })
        .eq('id', userId);

      if (error) {
        console.warn('Failed to sync AI tone to server:', error);
      } else {
        console.log('AI tone synced to server:', tone);
      }
    } catch (e) {
      console.warn('Failed to sync AI tone to server:', e);
    }
  }
}

/**
 * 从服务器获取用户的 AI 语气偏好
 */
export async function fetchAIToneFromServer(userId: string): Promise<AITone | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('ai_tone')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Failed to fetch AI tone from server:', error);
      return null;
    }

    if (data?.ai_tone && isValidAITone(data.ai_tone)) {
      return data.ai_tone as AITone;
    }

    return null;
  } catch (e) {
    console.warn('Failed to fetch AI tone from server:', e);
    return null;
  }
}

/**
 * 同步本地和服务器的 AI 语气设置
 * 优先使用服务器设置（如果存在）
 */
export async function syncAITone(userId: string): Promise<AITone> {
  const serverTone = await fetchAIToneFromServer(userId);
  const localTone = getAITone();

  if (serverTone) {
    // 服务器有设置，更新本地
    try {
      localStorage.setItem(STORAGE_KEY, serverTone);
    } catch {
      // 忽略
    }
    return serverTone;
  }

  // 服务器没有设置，使用本地设置并同步到服务器
  await setAITone(localTone, userId);
  return localTone;
}

/**
 * 验证是否为有效的 AI 语气类型
 */
function isValidAITone(tone: string): tone is AITone {
  return ['gentle', 'direct', 'humorous', 'tough_love'].includes(tone);
}
