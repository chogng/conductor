import {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  type LanguageCode,
  type TranslateFn,
} from "src/cs/platform/language/common/language";
import { createTranslateFn } from "src/cs/nls";

export type LanguageServiceSnapshot = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: TranslateFn;
};

class LanguageService {
  private language: LanguageCode = this.getInitialLanguage();
  private readonly listeners = new Set<() => void>();
  private snapshot: LanguageServiceSnapshot = this.createSnapshot();

  getSnapshot = (): LanguageServiceSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setLanguage = (nextLanguage: LanguageCode) => {
    if (!isLanguageCode(nextLanguage) || nextLanguage === this.language) return;
    this.language = nextLanguage;
    this.updateSnapshot();
  };

  private getInitialLanguage(): LanguageCode {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;
    return isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
      ? window.__CONDUCTOR_INITIAL_LANGUAGE__
      : DEFAULT_LANGUAGE;
  }

  private t: TranslateFn = (key, vars) =>
    createTranslateFn(this.language)(key, vars);

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
