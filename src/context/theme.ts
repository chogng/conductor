import { createContext } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

