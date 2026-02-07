/**
 * Language utilities for Lumi AI voice preferences
 *
 * Gemini Live Native Audio supports 24 languages for voice output.
 * This module manages user language preferences.
 *
 * 语言设置存储位置：
 * - localStorage: 本地快速访问
 * - users.preferences: 后端持久化，支持跨设备同步
 */

import { getSupabaseClient } from './supabase';

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * All languages supported by Gemini Live Native Audio
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'es-en', name: 'Spanglish', nativeName: 'Spanglish (ES+EN)' },
  { code: 'es-US', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  { code: 'pt-BR', name: 'Portuguese', nativeName: 'Português' },
  { code: 'id-ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar-XA', name: 'Arabic', nativeName: 'العربية' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th-TH', name: 'Thai', nativeName: 'ไทย' },
  { code: 'hi-en', name: 'Hinglish', nativeName: 'Hinglish (HI+EN)' },
  { code: 'en-IN', name: 'English (India)', nativeName: 'English (India)' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
  { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
];

const LANGUAGE_STORAGE_KEY = 'lumi_preferred_language';
const LANGUAGES_STORAGE_KEY = 'lumi_preferred_languages'; // 多语言存储
const UI_LANGUAGE_STORAGE_KEY = 'lumi_ui_language';

/**
 * Supported UI languages (languages with translations available)
 */
export interface UILanguage {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_UI_LANGUAGES: UILanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];

/**
 * Get the user's preferred UI language code
 * Priority: localStorage > system language > 'en'
 */
export function getUILanguage(): string {
  try {
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (stored) {
      return stored;
    }

    // Auto-detect from system language
    const systemLang = navigator.language?.split('-')[0] || 'en';
    const supportedCodes = SUPPORTED_UI_LANGUAGES.map(l => l.code);
    if (supportedCodes.includes(systemLang)) {
      return systemLang;
    }

    return 'en'; // Fallback to English
  } catch {
    return 'en';
  }
}

/**
 * Set the user's preferred UI language
 */
export function setUILanguage(languageCode: string): void {
  try {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, languageCode);
  } catch (error) {
    console.error('Failed to save UI language preference:', error);
  }
}

/**
 * Get the UI language native name from code
 */
export function getUILanguageNativeName(code: string): string {
  const lang = SUPPORTED_UI_LANGUAGES.find(l => l.code === code);
  return lang?.nativeName || code;
}

/**
 * Get the user's preferred language code
 * Returns null if auto-detect is enabled (default)
 */
export function getPreferredLanguage(): string | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'auto' || !stored) {
      return null; // Auto-detect mode
    }
    return stored;
  } catch {
    return null;
  }
}

/**
 * Set the user's preferred language
 * Pass null or 'auto' to enable auto-detection
 */
export function setPreferredLanguage(languageCode: string | null): void {
  try {
    if (languageCode === null || languageCode === 'auto') {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'auto');
    } else {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);
    }
  } catch (error) {
    console.error('Failed to save language preference:', error);
  }
}

/**
 * Get the language name from code for display
 */
export function getLanguageName(code: string | null): string {
  if (!code || code === 'auto') {
    return 'Auto-detect';
  }
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang?.name || code;
}

/**
 * Get the native language name from code
 */
export function getLanguageNativeName(code: string | null): string {
  if (!code || code === 'auto') {
    return 'Auto';
  }
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang?.nativeName || code;
}

/**
 * Get the user's preferred languages (multi-select)
 * Returns empty array if auto-detect is enabled (default)
 */
export function getPreferredLanguages(): string[] {
  try {
    const stored = localStorage.getItem(LANGUAGES_STORAGE_KEY);
    if (!stored || stored === 'auto') {
      return []; // Auto-detect mode
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Set the user's preferred languages (multi-select)
 * Pass empty array or null to enable auto-detection
 */
export function setPreferredLanguages(languageCodes: string[] | null): void {
  try {
    if (!languageCodes || languageCodes.length === 0) {
      localStorage.setItem(LANGUAGES_STORAGE_KEY, 'auto');
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'auto'); // 保持向后兼容
    } else {
      localStorage.setItem(LANGUAGES_STORAGE_KEY, JSON.stringify(languageCodes));
      localStorage.setItem(LANGUAGE_STORAGE_KEY, languageCodes[0]); // 保持向后兼容，存第一个
    }
  } catch (error) {
    console.error('Failed to save languages preference:', error);
  }
}

/**
 * Get display text for multiple selected languages
 */
export function getLanguagesDisplayText(codes: string[]): string {
  if (!codes || codes.length === 0) {
    return 'Auto';
  }
  if (codes.length === 1) {
    return getLanguageNativeName(codes[0]);
  }
  // 显示前两个语言 + 数量
  const firstTwo = codes.slice(0, 2).map(c => getLanguageNativeName(c));
  if (codes.length === 2) {
    return firstTwo.join(', ');
  }
  return `${firstTwo.join(', ')} +${codes.length - 2}`;
}

// ============================================
// 后端同步功能
// ============================================

/**
 * 语言偏好设置接口（存储在 users.preferences 中）
 */
export interface LanguagePreferences {
  ui_language?: string;           // UI 界面语言，如 'en', 'zh'
  voice_languages?: string[];     // Lumi 语音语言列表，如 ['en-US', 'zh-CN']
}

/**
 * 将语言设置同步到后端 users.preferences
 * 使用 JSONB 合并，不会覆盖其他 preferences 字段
 *
 * @param preferences - 要同步的语言偏好设置
 * @returns 是否同步成功
 */
export async function syncLanguagePreferencesToBackend(
  preferences: LanguagePreferences
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('⚠️ Supabase client not available, skipping backend sync');
      return false;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('⚠️ No user logged in, skipping backend sync');
      return false;
    }

    // 先获取当前的 preferences
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch user preferences:', fetchError);
      return false;
    }

    // 合并新的语言设置到现有 preferences
    const currentPreferences = userData?.preferences || {};
    const updatedPreferences = {
      ...currentPreferences,
      ...preferences,
    };

    // 更新到数据库
    const { error: updateError } = await supabase
      .from('users')
      .update({ preferences: updatedPreferences })
      .eq('id', user.id);

    if (updateError) {
      console.error('❌ Failed to sync language preferences to backend:', updateError);
      return false;
    }

    console.log('✅ Language preferences synced to backend:', preferences);
    return true;
  } catch (error) {
    console.error('❌ Error syncing language preferences:', error);
    return false;
  }
}

/**
 * 从后端加载语言设置到 localStorage
 * 用于用户登录后同步设置
 *
 * @returns 加载的语言偏好设置，如果失败返回 null
 */
export async function loadLanguagePreferencesFromBackend(): Promise<LanguagePreferences | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return null;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', user.id)
      .single();

    if (error || !userData?.preferences) {
      return null;
    }

    const preferences = userData.preferences as Record<string, unknown>;
    const languagePrefs: LanguagePreferences = {};

    // 提取语言相关设置
    if (typeof preferences.ui_language === 'string') {
      languagePrefs.ui_language = preferences.ui_language;
      // 同步到 localStorage
      localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, preferences.ui_language);
    }

    if (Array.isArray(preferences.voice_languages)) {
      languagePrefs.voice_languages = preferences.voice_languages as string[];
      // 同步到 localStorage
      localStorage.setItem(LANGUAGES_STORAGE_KEY, JSON.stringify(preferences.voice_languages));
      if (preferences.voice_languages.length > 0) {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, preferences.voice_languages[0] as string);
      }
    }

    console.log('✅ Language preferences loaded from backend:', languagePrefs);
    return languagePrefs;
  } catch (error) {
    console.error('❌ Error loading language preferences from backend:', error);
    return null;
  }
}

/**
 * 设置 UI 语言并同步到后端
 * 这是 setUILanguage 的增强版本
 *
 * @param languageCode - UI 语言代码
 * @param syncToBackend - 是否同步到后端（默认 true）
 */
export async function setUILanguageWithSync(
  languageCode: string,
  syncToBackend = true
): Promise<void> {
  // 1. 保存到 localStorage（立即生效）
  setUILanguage(languageCode);

  // 2. 同步到 iOS（供 Shield Extension 显示本地化推送通知）
  syncUILanguageToiOS(languageCode);

  // 3. 异步同步到后端
  if (syncToBackend) {
    syncLanguagePreferencesToBackend({ ui_language: languageCode });
  }
}

/**
 * 将 UI 语言同步到 iOS 原生端
 * Shield Extension 会根据此设置显示本地化的推送通知
 */
export function syncUILanguageToiOS(languageCode?: string): void {
  try {
    const lang = languageCode || getUILanguage();
    if (window.webkit?.messageHandlers?.screenTime) {
      window.webkit.messageHandlers.screenTime.postMessage({
        action: 'setUILanguage',
        language: lang,
      });
      console.log('[iOS] UI 语言已同步:', lang);
    }
  } catch (error) {
    console.warn('[iOS] 同步语言到 iOS 失败:', error);
  }
}

/**
 * 设置 Lumi 语音语言并同步到后端
 * 这是 setPreferredLanguages 的增强版本
 *
 * @param languageCodes - 语音语言代码列表
 * @param syncToBackend - 是否同步到后端（默认 true）
 */
export async function setPreferredLanguagesWithSync(
  languageCodes: string[] | null,
  syncToBackend = true
): Promise<void> {
  // 1. 保存到 localStorage（立即生效）
  setPreferredLanguages(languageCodes);

  // 2. 异步同步到后端
  if (syncToBackend) {
    syncLanguagePreferencesToBackend({
      voice_languages: languageCodes || [],
    });
  }
}
