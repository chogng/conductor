import { DEFAULT_LANGUAGE, type LanguageCode } from '../config/language';

export type TranslationMessages = Record<string, string>;

const translationLoaders: Record<
  LanguageCode,
  () => Promise<{ default: TranslationMessages }>
> = {
  en: () => import('./en'),
  zh: () => import('./zh'),
};

const translationCache = new Map<LanguageCode, TranslationMessages>();

export const preloadLanguageMessages = async (
  language: LanguageCode,
): Promise<TranslationMessages> => {
  const normalizedLanguage =
    language in translationLoaders ? language : DEFAULT_LANGUAGE;
  const cached = translationCache.get(normalizedLanguage);
  if (cached) return cached;

  const loadedModule = await translationLoaders[normalizedLanguage]();
  const messages = loadedModule.default;
  translationCache.set(normalizedLanguage, messages);
  return messages;
};

export const getCachedLanguageMessages = (
  language: LanguageCode,
): TranslationMessages | null => {
  return translationCache.get(language) ?? null;
};
