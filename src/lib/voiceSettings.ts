/**
 * AI 声音设置工具库
 *
 * 管理用户对 AI 声音的偏好，
 * 用于 Gemini Live 连接时选择对应的声音。
 *
 * 支持的声音：
 * - Puck: 男声（默认）
 * - Kore: 女声
 * - Zephyr: 女声
 */

const VOICE_NAME_STORAGE_KEY = 'lumi_voice_name';

/**
 * AI 声音名称
 */
export type VoiceName = 'Puck' | 'Kore' | 'Zephyr';

/**
 * 声音性别类型（用于 UI 显示）
 */
export type VoiceGender = 'male' | 'female';

/**
 * 支持试听的语言代码
 */
export type PreviewLanguage = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'ar' | 'vi' | 'nl' | 'id';

/**
 * 声音信息
 */
export interface VoiceInfo {
  name: VoiceName;
  gender: VoiceGender;
  displayName: string;
}

/**
 * 获取 Supabase URL
 */
function getSupabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) {
    console.warn('VITE_SUPABASE_URL not configured');
    return '';
  }
  return url;
}

/**
 * 获取声音试听 URL（支持多语言）
 * @param voiceName - 声音名称
 * @param language - 语言代码（默认英文）
 * @returns 试听音频的公开 URL
 */
export function getVoicePreviewUrl(voiceName: VoiceName, language: PreviewLanguage = 'en'): string {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return '';
  return `${supabaseUrl}/storage/v1/object/public/voice-previews/${voiceName.toLowerCase()}-${language}-preview.wav`;
}

/**
 * 从 UI 语言代码映射到试听语言代码
 * @param uiLanguage - UI 语言代码（如 'zh-CN', 'en-US'）
 * @returns 试听语言代码
 */
export function mapUILanguageToPreviewLanguage(uiLanguage: string): PreviewLanguage {
  // 提取语言代码前缀
  const langCode = uiLanguage.split('-')[0].toLowerCase();

  // 映射到支持的试听语言
  const languageMap: Record<string, PreviewLanguage> = {
    'en': 'en',
    'zh': 'zh',
    'ja': 'ja',
    'ko': 'ko',
    'es': 'es',
    'fr': 'fr',
    'de': 'de',
    'it': 'it',
    'pt': 'pt',
    'ru': 'ru',
    'ar': 'ar',
    'vi': 'vi',
    'nl': 'nl',
    'id': 'id',
  };

  return languageMap[langCode] || 'en';
}

/**
 * 所有可用声音列表
 */
export const AVAILABLE_VOICES: VoiceInfo[] = [
  { name: 'Puck', gender: 'male', displayName: 'Puck' },
  { name: 'Kore', gender: 'female', displayName: 'Kore' },
  { name: 'Zephyr', gender: 'female', displayName: 'Zephyr' },
];

/**
 * 声音名称与性别的映射
 */
const VOICE_TO_GENDER: Record<VoiceName, VoiceGender> = {
  Puck: 'male',
  Kore: 'female',
  Zephyr: 'female',
};

/**
 * 验证是否为有效的声音名称
 */
function isValidVoiceName(name: string): name is VoiceName {
  return AVAILABLE_VOICES.some(v => v.name === name);
}

/**
 * 获取用户选择的 AI 声音名称
 *
 * @returns 用户设置的声音名称，默认为 'Puck'（男声）
 */
export function getVoiceName(): VoiceName {
  try {
    const stored = localStorage.getItem(VOICE_NAME_STORAGE_KEY);
    if (stored && isValidVoiceName(stored)) {
      return stored;
    }
    return 'Puck'; // 默认男声
  } catch {
    return 'Puck';
  }
}

/**
 * 获取用户选择的 AI 声音性别（用于 UI 显示）
 *
 * @returns 'male' 或 'female'
 */
export function getVoiceGender(): VoiceGender {
  return VOICE_TO_GENDER[getVoiceName()];
}

/**
 * 获取当前选择的声音信息
 */
export function getCurrentVoiceInfo(): VoiceInfo {
  const name = getVoiceName();
  return AVAILABLE_VOICES.find(v => v.name === name) || AVAILABLE_VOICES[0];
}

/**
 * 设置用户的 AI 声音偏好
 *
 * @param voiceName - 声音名称
 */
export function setVoiceName(voiceName: VoiceName): void {
  try {
    localStorage.setItem(VOICE_NAME_STORAGE_KEY, voiceName);
  } catch (error) {
    console.error('Failed to save voice name preference:', error);
  }
}

/**
 * 获取指定性别的声音列表
 *
 * @param gender - 性别 ('male' | 'female')
 * @returns 该性别的所有声音
 */
export function getVoicesByGender(gender: VoiceGender): VoiceInfo[] {
  return AVAILABLE_VOICES.filter(v => v.gender === gender);
}

/**
 * 检查当前是否为男声
 *
 * @returns true 如果是男声
 */
export function isMaleVoice(): boolean {
  return getVoiceGender() === 'male';
}

/**
 * 检查当前是否为女声
 *
 * @returns true 如果是女声
 */
export function isFemaleVoice(): boolean {
  return getVoiceGender() === 'female';
}
