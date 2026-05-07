import { isThemeMode, type ThemeMode } from 'src/cs/workbench/common/theme';

export type ThemeServiceSnapshot = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

class WorkbenchThemeService {
  private theme: ThemeMode = this.getInitialTheme();
  private readonly listeners = new Set<() => void>();
  private snapshot: ThemeServiceSnapshot = this.createSnapshot();
  private mediaQuery: MediaQueryList | null = null;
  private darkThemeStylesPromise: Promise<unknown> | null = null;
  private started = false;

  getSnapshot = (): ThemeServiceSnapshot => {
    this.start();
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.start();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setTheme = (nextTheme: ThemeMode) => {
    if (!isThemeMode(nextTheme) || nextTheme === this.theme) return;
    this.theme = nextTheme;
    this.updateSnapshot();
    void this.applyTheme(nextTheme);
  };

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.mediaQuery.addEventListener('change', this.handleColorSchemeChange);
    void this.applyTheme(this.theme);
  }

  private getInitialTheme(): ThemeMode {
    if (typeof window === 'undefined') return 'system';
    return isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
      ? window.__CONDUCTOR_INITIAL_THEME__
      : 'system';
  }

  private handleColorSchemeChange = () => {
    if (this.theme === 'system') {
      void this.applyTheme('system');
    }
  };

  private resolveTheme(nextTheme: ThemeMode): Exclude<ThemeMode, 'system'> {
    if (nextTheme !== 'system') return nextTheme;
    return this.mediaQuery?.matches ? 'dark' : 'light';
  }

  private async ensureDarkThemeStyles() {
    this.darkThemeStylesPromise ??= import('src/styles/variables-dark.css');
    await this.darkThemeStylesPromise;
  }

  private async applyTheme(nextTheme: ThemeMode) {
    if (typeof window === 'undefined') return;

    const resolvedTheme = this.resolveTheme(nextTheme);
    if (resolvedTheme === 'dark') {
      await this.ensureDarkThemeStyles();
    }

    const root = window.document.documentElement;
    root.classList.remove('dark');
    root.classList.remove('light');
    root.classList.add(resolvedTheme);
  }

  private createSnapshot(): ThemeServiceSnapshot {
    return {
      theme: this.theme,
      setTheme: this.setTheme,
    };
  }

  private updateSnapshot() {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export const workbenchThemeService = new WorkbenchThemeService();
