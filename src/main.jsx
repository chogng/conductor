import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/variables.css'
import App from './App.jsx'
import { initCtaTracking } from './utils/ctaTracking.js'

// Track last input modality so focus rings can be limited to keyboard navigation.
if (!window.__APPOINTER_NAV_MODE_INIT__) {
  window.__APPOINTER_NAV_MODE_INIT__ = true;

  const root = document.documentElement;

  const setMode = (mode) => {
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
