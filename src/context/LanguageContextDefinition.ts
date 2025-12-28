import { createContext } from 'react';

export interface LanguageContextType {
    /** Current UI language code (e.g., 'ja', 'en') */
    uiLanguage: string;
    /** Set the UI language */
    setUILanguage: (code: string) => void;
    /** Translate a key */
    t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextType>({
    uiLanguage: 'en',
    setUILanguage: () => { },
    t: (key) => key,
});
