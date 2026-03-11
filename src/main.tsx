import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ThemeMode } from './context/theme';
import { isThemeMode } from './context/theme';
import './styles/global.css';
import './styles/variables.css';
import App from './App';
import { initCtaTracking } from './utils/ctaTracking';

declare global {
  interface Window {
    __APPOINTER_NAV_MODE_INIT__?: boolean;
    __APPOINTER_INITIAL_THEME__?: ThemeMode;
  }
}

// Track last input modality so focus rings can be limited to keyboard navigation.
if (!window.__APPOINTER_NAV_MODE_INIT__) {
  window.__APPOINTER_NAV_MODE_INIT__ = true;

  const root = document.documentElement;

  const setMode = (mode: 'keyboard' | 'pointer') => {
    if (!root) return;
    root.dataset.nav = mode;
  };

  window.addEventListener(
    'keydown',
    (e) => {
      // "Tab focus ring" behavior
      if (e.key === 'Tab') setMode('keyboard');
    },
    true,
  );

  window.addEventListener(
    'pointerdown',
    () => {
      setMode('pointer');
    },
    true,
  );
}

initCtaTracking();

const dismissBootSplash = () => {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;

  splash.classList.add('is-hidden');
  window.setTimeout(() => {
    splash.remove();
  }, 220);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

const resolveTheme = (theme: ThemeMode): Exclude<ThemeMode, 'system'> => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  return theme;
};

const applyDocumentTheme = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.classList.remove('dark');
  root.classList.remove('light');
  root.classList.add(resolveTheme(theme));
};

const loadInitialTheme = async (): Promise<ThemeMode> => {
  try {
    const settings = await window.desktopStore?.getDeviceAnalysisSettings?.();
    const theme =
      settings && typeof settings === 'object'
        ? (settings as { theme?: unknown }).theme
        : undefined;

    return isThemeMode(theme) ? theme : 'system';
  } catch {
    return 'system';
  }
};

const startApp = async () => {
  const initialTheme = await loadInitialTheme();
  window.__APPOINTER_INITIAL_THEME__ = initialTheme;
  applyDocumentTheme(initialTheme);

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      dismissBootSplash();
    });
  });
};

void startApp();
