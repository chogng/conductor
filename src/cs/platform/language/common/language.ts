export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export type LanguagePreference = 'system' | LanguageCode;

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  value === 'en' || value === 'zh';

export const isLanguagePreference = (
  value: unknown,
): value is LanguagePreference =>
  value === 'system' || isLanguageCode(value);

export const resolveLanguageCode = (
  preference: unknown,
  systemLanguage: unknown,
): LanguageCode => {
  if (isLanguageCode(preference)) return preference;

  const source = typeof systemLanguage === 'string' ? systemLanguage.toLowerCase() : '';
  if (source.startsWith('zh')) return 'zh';
  if (source.startsWith('en')) return 'en';

  return DEFAULT_LANGUAGE;
};
