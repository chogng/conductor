import { createContext } from 'react';
import type { ThemeMode } from '../config/theme';
export type { ThemeMode } from '../config/theme';
export { isThemeMode } from '../config/theme';

export type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

