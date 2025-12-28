/**
 * Language Context for UI internationalization
 *
 * Provides language state and translation function to all components
 * UI language is now independent from Lumi's voice language
 */

import React, { createContext, useCallback, useState } from 'react';
import { getUILanguage, setUILanguage as saveUILanguage } from '../lib/language';
import { translate } from '../lib/i18n';

interface LanguageContextType {
  /** Current UI language code (e.g., 'ja', 'en') */
  uiLanguage: string;
  /** Set the UI language */
  setUILanguage: (code: string) => void;
  /** Translate a key */
  t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextType>({
  uiLanguage: 'en',
  setUILanguage: () => {},
  t: (key) => key,
});

interface LanguageProviderProps {
  children: React.ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [uiLanguage, setUiLanguageState] = useState<string>(() => getUILanguage());

  const setUILanguage = useCallback((code: string) => {
    saveUILanguage(code);
    setUiLanguageState(code);
  }, []);

  const t = useCallback((key: string): string => {
    return translate(key, uiLanguage);
  }, [uiLanguage]);

  return (
    <LanguageContext.Provider value={{ uiLanguage, setUILanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
