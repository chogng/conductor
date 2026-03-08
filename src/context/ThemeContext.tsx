import { useEffect, useState, type ReactNode } from 'react';
import { ThemeContext, type ThemeMode } from './theme-context';

type ThemeProviderProps = {
  children: ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<ThemeMode>('system');

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const removeOldTheme = () => {
      root.classList.remove('dark');
      root.classList.remove('light');
    };

    const applyTheme = (nextTheme: ThemeMode) => {
      removeOldTheme();
      if (nextTheme === 'system') {
        const systemTheme = mediaQuery.matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
        return;
      }

      root.classList.add(nextTheme);
    };

    applyTheme(theme);

    if (theme !== 'system') return undefined;

    const handleChange = () => applyTheme('system');
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};
