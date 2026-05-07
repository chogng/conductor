import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  type LanguageCode,
  type TranslateFn,
} from 'src/cs/platform/language/common/language';
import {
  getCachedLanguageMessages,
  preloadLanguageMessages,
  type TranslationMessages,
} from 'src/i18n/loader';

export type LanguageServiceSnapshot = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: TranslateFn;
};

class LanguageService {
  private language: LanguageCode = this.getInitialLanguage();
  private readonly listeners = new Set<() => void>();
  private messagesByLanguage: Partial<Record<LanguageCode, TranslationMessages>> = {};
  private snapshot: LanguageServiceSnapshot = this.createSnapshot();

  constructor() {
    this.messagesByLanguage = this.getInitialMessages();
    void this.ensureMessages(this.language);
  }

  getSnapshot = (): LanguageServiceSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    void this.ensureMessages(this.language);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setLanguage = (nextLanguage: LanguageCode) => {
    if (!isLanguageCode(nextLanguage) || nextLanguage === this.language) return;
    this.language = nextLanguage;
    this.updateSnapshot();
    void this.ensureMessages(nextLanguage);
  };

  private getInitialLanguage(): LanguageCode {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
    return isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
      ? window.__CONDUCTOR_INITIAL_LANGUAGE__
      : DEFAULT_LANGUAGE;
  }

  private getInitialMessages(): Partial<Record<LanguageCode, TranslationMessages>> {
    const initialMessages = getCachedLanguageMessages(this.language);
    const englishMessages = getCachedLanguageMessages('en');

    return {
      ...(initialMessages ? { [this.language]: initialMessages } : {}),
      ...(englishMessages ? { en: englishMessages } : {}),
    };
  }

  private async ensureMessages(nextLanguage: LanguageCode) {
    const [currentMessages, englishMessages] = await Promise.all([
      preloadLanguageMessages(nextLanguage),
      nextLanguage === 'en'
        ? Promise.resolve(null)
        : preloadLanguageMessages('en'),
    ]);

    this.messagesByLanguage = {
      ...this.messagesByLanguage,
      [nextLanguage]: currentMessages,
      ...(englishMessages ? { en: englishMessages } : {}),
    };
    this.updateSnapshot();
  }

  private t: TranslateFn = (key, vars = {}) => {
    const currentMessages = this.messagesByLanguage[this.language];
    const englishMessages = this.messagesByLanguage.en;
    const template = currentMessages?.[key] ?? englishMessages?.[key] ?? key;

    return Object.entries(vars).reduce((acc, [varKey, value]) => {
      return acc.replaceAll('{' + varKey + '}', String(value));
    }, template);
  };

  private createSnapshot(): LanguageServiceSnapshot {
    return {
      language: this.language,
      setLanguage: this.setLanguage,
      t: this.t,
    };
  }

  private updateSnapshot() {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export const languageService = new LanguageService();
