import { useEffect, useState, type ReactNode } from 'react';
import { ThemeContext, isThemeMode, type ThemeMode } from './theme';

type ThemeProviderProps = {
  children: ReactNode;
};

declare global {
  interface Window {
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
  }
}

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  return isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
    ? window.__CONDUCTOR_INITIAL_THEME__
    : 'system';
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let cancelled = false;
    let darkThemeStylesPromise: Promise<unknown> | null = null;

    const removeOldTheme = () => {
      root.classList.remove('dark');
      root.classList.remove('light');
    };

    const resolveTheme = (nextTheme: ThemeMode): Exclude<ThemeMode, 'system'> => {
      if (nextTheme === 'system') {
        return mediaQuery.matches ? 'dark' : 'light';
      }

      return nextTheme;
    };

    const ensureDarkThemeStyles = async () => {
      if (!darkThemeStylesPromise) {
        darkThemeStylesPromise = import('../styles/variables-dark.css');
      }

      await darkThemeStylesPromise;
    };

    const applyTheme = async (nextTheme: ThemeMode) => {
      const resolvedTheme = resolveTheme(nextTheme);
      if (resolvedTheme === 'dark') {
        await ensureDarkThemeStyles();
      }

      if (cancelled) return;

      removeOldTheme();
      root.classList.add(resolvedTheme);
    };

    void applyTheme(theme);

    if (theme !== 'system') {
      return () => {
        cancelled = true;
      };
    }

    const handleChange = () => {
      void applyTheme('system');
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      cancelled = true;
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
