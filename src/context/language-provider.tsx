import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LANGUAGE, translations } from '../i18n/translations';
import {
  LanguageContext,
  type LanguageCode,
  type LanguageContextValue,
  type TranslateFn,
  type TranslationVars,
} from './language';

type LanguageProviderProps = {
  children: ReactNode;
};

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  const t = useCallback<TranslateFn>((key, vars: TranslationVars = {}) => {
    const template = translations[language]?.[key] ?? translations.en[key] ?? key;

    return Object.entries(vars).reduce((acc, [varKey, value]) => {
      return acc.replaceAll('{' + varKey + '}', String(value));
    }, template);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t }),
    [language, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
