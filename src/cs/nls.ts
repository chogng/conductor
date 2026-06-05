import enMessages from "../../build/nls/en.json" with { type: "json" };
import zhMessages from "../../build/nls/zh.json" with { type: "json" };

export const SUPPORTED_NLS_LANGUAGES = ["en", "zh"] as const;

export type NLSLanguage = (typeof SUPPORTED_NLS_LANGUAGES)[number];

export type NLSMessages = Record<string, string>;

export type NLSVars = Record<string, string | number | boolean | null | undefined>;

export type NLSConfiguration = {
  readonly language: NLSLanguage;
  readonly messages: NLSMessages;
};

declare global {
  // eslint-disable-next-line no-var
  var _CONDUCTOR_NLS_MESSAGES: NLSMessages | undefined;
  // eslint-disable-next-line no-var
  var _CONDUCTOR_NLS_LANGUAGE: NLSLanguage | undefined;
}

const DEFAULT_LANGUAGE: NLSLanguage = "en";

const builtInMessages: Record<NLSLanguage, NLSMessages> = {
  en: enMessages,
  zh: zhMessages,
};

const isNLSLanguage = (value: unknown): value is NLSLanguage =>
  value === "en" || value === "zh";

const format = (message: string, vars: NLSVars = {}): string => {
  return Object.entries(vars).reduce((acc, [key, value]) => {
    return acc.replaceAll("{" + key + "}", String(value ?? ""));
  }, message);
};

export const resolveNLSLanguage = (value: unknown): NLSLanguage => {
  if (isNLSLanguage(value)) return value;
  if (typeof value !== "string") return DEFAULT_LANGUAGE;

  const normalized = value.toLowerCase();
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("en")) return "en";

  return DEFAULT_LANGUAGE;
};

export const getBuiltInNLSMessages = (language: NLSLanguage): NLSMessages =>
  builtInMessages[language] ?? builtInMessages[DEFAULT_LANGUAGE];

export const createNLSConfiguration = (
  language: unknown,
): NLSConfiguration => {
  const resolvedLanguage = resolveNLSLanguage(language);

  return {
    language: resolvedLanguage,
    messages: getBuiltInNLSMessages(resolvedLanguage),
  };
};

export const setNLSConfiguration = (configuration: NLSConfiguration): void => {
  globalThis._CONDUCTOR_NLS_LANGUAGE = configuration.language;
  globalThis._CONDUCTOR_NLS_MESSAGES = configuration.messages;
};

export const getNLSLanguage = (): NLSLanguage =>
  globalThis._CONDUCTOR_NLS_LANGUAGE ?? DEFAULT_LANGUAGE;

export const getNLSMessages = (): NLSMessages =>
  globalThis._CONDUCTOR_NLS_MESSAGES ?? getBuiltInNLSMessages(getNLSLanguage());

export const localize = (
  key: string,
  defaultMessage: string,
  vars?: NLSVars,
): string => {
  const messages = getNLSMessages();
  const template = messages[key] ?? builtInMessages.en[key] ?? defaultMessage;
  return format(template, vars);
};
