import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '../config/language';
import {
  getCachedLanguageMessages,
  preloadLanguageMessages,
  type TranslationMessages,
} from '../i18n/loader';
import {
  LanguageContext,
  type LanguageContextValue,
  type TranslateFn,
  type TranslationVars,
} from './language';

type LanguageProviderProps = {
  children: ReactNode;
};

declare global {
  interface Window {
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
  }
}

const getInitialLanguage = (): LanguageCode => {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  return isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
    ? window.__CONDUCTOR_INITIAL_LANGUAGE__
    : DEFAULT_LANGUAGE;
};

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  const [language, setLanguage] = useState<LanguageCode>(() => getInitialLanguage());
  const [messagesByLanguage, setMessagesByLanguage] = useState<
    Partial<Record<LanguageCode, TranslationMessages>>
  >(() => {
    const initialLanguage = getInitialLanguage();
    const cachedInitial = getCachedLanguageMessages(initialLanguage);
    const cachedEnglish = getCachedLanguageMessages('en');

    return {
      ...(cachedInitial ? { [initialLanguage]: cachedInitial } : {}),
      ...(cachedEnglish ? { en: cachedEnglish } : {}),
    };
  });

  useEffect(() => {
    let cancelled = false;

    const ensureMessages = async (nextLanguage: LanguageCode) => {
      const [currentMessages, englishMessages] = await Promise.all([
        preloadLanguageMessages(nextLanguage),
        nextLanguage === 'en'
          ? Promise.resolve(null)
          : preloadLanguageMessages('en'),
      ]);
      if (cancelled) return;

      setMessagesByLanguage((prev) => ({
        ...prev,
        [nextLanguage]: currentMessages,
        ...(englishMessages ? { en: englishMessages } : {}),
      }));
    };

    void ensureMessages(language);

    return () => {
      cancelled = true;
    };
  }, [language]);

  const t = useCallback<TranslateFn>((key, vars: TranslationVars = {}) => {
    const currentMessages = messagesByLanguage[language];
    const englishMessages = messagesByLanguage.en;
    const template = currentMessages?.[key] ?? englishMessages?.[key] ?? key;

    return Object.entries(vars).reduce((acc, [varKey, value]) => {
      return acc.replaceAll('{' + varKey + '}', String(value));
    }, template);
  }, [language, messagesByLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t }),
    [language, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
