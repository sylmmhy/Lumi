import { createContext } from 'react';

/**
 * 翻译变量替换参数
 * 用于替换翻译字符串中的 {{variable}} 占位符
 */
export type TranslationParams = Record<string, string | number>;

export interface LanguageContextType {
    /** Current UI language code (e.g., 'ja', 'en') */
    uiLanguage: string;
    /** Set the UI language */
    setUILanguage: (code: string) => void;
    /**
     * Translate a key with optional variable substitution
     * @param key - The translation key
     * @param params - Optional variables to substitute (e.g., { time: '08:00' })
     * @example t('tour.step3.content', { time: '08:00' })
     */
    t: (key: string, params?: TranslationParams) => string;
}

export const LanguageContext = createContext<LanguageContextType>({
    uiLanguage: 'en',
    setUILanguage: () => { },
    t: (key) => key,
});
