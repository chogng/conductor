export type ThemeMode = 'light' | 'dark' | 'system';

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';
