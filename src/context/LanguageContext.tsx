/**
 * Language Context for UI internationalization
 *
 * Provides language state and translation function to all components
 * UI language is now independent from Lumi's voice language
 */

import React, { useCallback, useState } from 'react';
import { LanguageContext } from './LanguageContextDefinition';
import type { TranslationParams } from './LanguageContextDefinition';
import { getUILanguage, setUILanguage as saveUILanguage } from '../lib/language';
import { translate } from '../lib/i18n';



interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [uiLanguage, setUiLanguageState] = useState<string>(() => getUILanguage());

  const setUILanguage = useCallback((code: string) => {
    saveUILanguage(code);
    setUiLanguageState(code);
  }, []);

  /**
   * 翻译函数，支持变量替换
   * @param key - 翻译 key
   * @param params - 可选的变量替换参数，如 { time: '08:00' }
   * @returns 翻译后的字符串（变量已替换）
   */
  const t = useCallback((key: string, params?: TranslationParams): string => {
    let result = translate(key, uiLanguage);

    // 如果有变量参数，替换 {{variable}} 占位符
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        result = result.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(value));
      });
    }

    return result;
  }, [uiLanguage]);

  return (
    <LanguageContext.Provider value={{ uiLanguage, setUILanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
