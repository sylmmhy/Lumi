/**
 * Language utilities for Lumi AI voice preferences
 *
 * Gemini Live Native Audio supports 24 languages for voice output.
 * This module manages user language preferences.
 */

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * All languages supported by Gemini Live Native Audio
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English' },
  { code: 'en-IN', name: 'English (India)', nativeName: 'English (India)' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'es-US', name: 'Spanish (US)', nativeName: 'Español' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português' },
  { code: 'ar-XA', name: 'Arabic', nativeName: 'العربية' },
  { code: 'id-ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
  { code: 'th-TH', name: 'Thai', nativeName: 'ไทย' },
];

const LANGUAGE_STORAGE_KEY = 'lumi_preferred_language';
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
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];

/**
 * Get the user's preferred UI language code
 * Returns 'en' as default
 */
export function getUILanguage(): string {
  try {
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (!stored) {
      return 'en'; // Default to English
    }
    return stored;
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
