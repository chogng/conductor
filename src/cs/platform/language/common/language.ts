export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  value === 'en' || value === 'zh';

export type TranslationVars = Record<string, string | number | boolean | null | undefined>;

export type TranslateFn = (key: string, vars?: TranslationVars) => string;
