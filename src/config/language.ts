export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: LanguageCode = 'zh';

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  value === 'en' || value === 'zh';
