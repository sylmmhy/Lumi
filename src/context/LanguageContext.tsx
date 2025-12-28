/**
 * Language Context for UI internationalization
 *
 * Provides language state and translation function to all components
 * UI language is now independent from Lumi's voice language
 */

import React, { useCallback, useState } from 'react';
import { LanguageContext } from './LanguageContextDefinition';
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

  const t = useCallback((key: string): string => {
    return translate(key, uiLanguage);
  }, [uiLanguage]);

  return (
    <LanguageContext.Provider value={{ uiLanguage, setUILanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
