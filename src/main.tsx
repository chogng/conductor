import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './styles/variables.css';
import App from './App';
import { initCtaTracking } from './utils/ctaTracking.js';

declare global {
  interface Window {
    __APPOINTER_NAV_MODE_INIT__?: boolean;
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
