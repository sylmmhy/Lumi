/**
 * Internationalization (i18n) system for Lumi UI
 *
 * Supports: English, Japanese, Korean, Italian, Spanish, Chinese
 */

import en from '../locales/en.json';
import ja from '../locales/ja.json';
import ko from '../locales/ko.json';
import it from '../locales/it.json';
import es from '../locales/es.json';
import zh from '../locales/zh.json';

export type TranslationKey = keyof typeof en;

type Translations = Record<string, Record<string, string>>;

const translations: Translations = {
  en,
  ja,
  ko,
  it,
  es,
  zh,
};

// Map full language codes to simplified codes
const languageCodeMap: Record<string, string> = {
  'en-US': 'en',
  'en-IN': 'en',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'it-IT': 'it',
  'es-US': 'es',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
};

/**
 * Get the simplified language code for i18n
 */
export function getI18nLanguage(fullCode: string | null): string {
  if (!fullCode || fullCode === 'auto') {
    return 'en'; // Default to English for auto-detect
  }
  return languageCodeMap[fullCode] || 'en';
}

/**
 * Check if a language is supported for UI translation
 */
export function isUILanguageSupported(fullCode: string | null): boolean {
  if (!fullCode || fullCode === 'auto') {
    return false;
  }
  return fullCode in languageCodeMap;
}

/**
 * Get all supported UI languages
 */
export function getSupportedUILanguages(): string[] {
  return Object.keys(languageCodeMap);
}

/**
 * Translate a key to the current language
 */
export function translate(key: string, language: string): string {
  const lang = translations[language] || translations.en;
  return lang[key] || translations.en[key] || key;
}

export default translations;
