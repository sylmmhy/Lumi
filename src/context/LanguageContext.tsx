/**
 * Language Context for UI internationalization
 *
 * Provides language state and translation function to all components
 */

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { getPreferredLanguage, setPreferredLanguage as savePreferredLanguage } from '../lib/language';
import { getI18nLanguage, translate } from '../lib/i18n';

interface LanguageContextType {
  /** Current full language code (e.g., 'ja-JP') or null for auto-detect */
  languageCode: string | null;
  /** Current i18n language (e.g., 'ja') */
  i18nLanguage: string;
  /** Set the preferred language */
  setLanguage: (code: string | null) => void;
  /** Translate a key */
  t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextType>({
  languageCode: null,
  i18nLanguage: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [languageCode, setLanguageCode] = useState<string | null>(() => getPreferredLanguage());
  const [i18nLanguage, setI18nLanguage] = useState<string>(() => getI18nLanguage(getPreferredLanguage()));

  // Update i18n language when language code changes
  useEffect(() => {
    setI18nLanguage(getI18nLanguage(languageCode));
  }, [languageCode]);

  const setLanguage = useCallback((code: string | null) => {
    savePreferredLanguage(code);
    setLanguageCode(code);
  }, []);

  const t = useCallback((key: string): string => {
    return translate(key, i18nLanguage);
  }, [i18nLanguage]);

  return (
    <LanguageContext.Provider value={{ languageCode, i18nLanguage, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
