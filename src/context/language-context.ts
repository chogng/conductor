import { createContext, type Dispatch, type SetStateAction } from 'react';

export type LanguageCode = 'en' | 'zh';

export type TranslationVars = Record<string, string | number | boolean | null | undefined>;

export type TranslateFn = (key: string, vars?: TranslationVars) => string;

export type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: Dispatch<SetStateAction<LanguageCode>>;
  t: TranslateFn;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);

