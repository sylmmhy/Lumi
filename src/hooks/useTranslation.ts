/**
 * Hook for accessing translation function and language state
 */

import { useContext } from 'react';
import { LanguageContext } from '../context/LanguageContext';

/**
 * Use translation in components
 *
 * @example
 * const { t } = useTranslation();
 * return <h1>{t('home.title')}</h1>;
 */
export function useTranslation() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }

  return context;
}
