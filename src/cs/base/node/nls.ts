import {
  createNLSConfiguration,
  resolveNLSLanguage,
  type NLSConfiguration,
} from "../../nls.js";

export type ResolveNLSConfigurationOptions = {
  readonly language?: unknown;
  readonly osLocale?: string;
};

export const resolveNLSConfiguration = ({
  language,
  osLocale,
}: ResolveNLSConfigurationOptions): NLSConfiguration => {
  const resolvedLanguage = resolveNLSLanguage(
    language === "system" ? osLocale : language ?? osLocale,
  );
  return createNLSConfiguration(resolvedLanguage);
};
