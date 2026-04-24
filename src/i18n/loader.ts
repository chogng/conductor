import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  type LanguageCode,
} from '../config/language';
import enMessages from './en';
import zhMessages from './zh';

export type TranslationMessages = Record<string, string>;

const staticMessages: Record<LanguageCode, TranslationMessages> = {
  en: enMessages,
  zh: zhMessages,
};

const translationCache = new Map<LanguageCode, TranslationMessages>(
  Object.entries(staticMessages) as [LanguageCode, TranslationMessages][],
);

export const preloadLanguageMessages = async (
  language: LanguageCode,
): Promise<TranslationMessages> => {
  const normalizedLanguage = isLanguageCode(language)
    ? language
    : DEFAULT_LANGUAGE;
  const cached = translationCache.get(normalizedLanguage);
  if (cached) return cached;

  const messages = staticMessages[normalizedLanguage];
  translationCache.set(normalizedLanguage, messages);
  return messages;
};

export const getCachedLanguageMessages = (
  language: LanguageCode,
): TranslationMessages | null => {
  return translationCache.get(language) ?? null;
};
