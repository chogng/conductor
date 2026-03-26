import { Fragment, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import type { LanguageCode } from './config/language';
import type { ThemeMode } from './config/theme';
import { loadDeviceAnalysisApp, loadWorkbenchApp } from './workbench-loader';

declare global {
  interface Window {
    desktopBootstrap?: {
      initialDeviceAnalysisSettings?: Record<string, unknown> | null;
      [key: string]: unknown;
    };
    desktopMeta?: {
      isDesktop?: boolean;
      platform?: string;
      isPackaged?: boolean;
      [key: string]: unknown;
    };
    __CONDUCTOR_NAV_MODE_INIT__?: boolean;
    __CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__?: Record<string, unknown> | null;
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
    __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
    __CONDUCTOR_BOOT_DISMISS_SPLASH__?: () => void;
    __CONDUCTOR_BOOT_LOG_NAVIGATION__?: () => void;
    __CONDUCTOR_BOOT_LOG_RESOURCES__?: () => void;
  }
}

const logRendererBoot = (stage: string, extra = '') => {
  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

const dismissBootSplash = () => {
  window.__CONDUCTOR_BOOT_DISMISS_SPLASH__?.();
};

const appShellStyle: React.CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
};

const appShellTextStyle: React.CSSProperties = {
  fontSize: '12px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  opacity: 0.68,
};

const WorkbenchShell = () => (
  <div style={appShellStyle}>
    <div style={appShellTextStyle}>Loading workspace...</div>
  </div>
);

const RootMode =
  import.meta.env.DEV && window.desktopMeta?.isDesktop ? Fragment : StrictMode;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

logRendererBoot('main:module-evaluated');
logRendererBoot('app:module-requested');

const workbenchAppPromise = loadWorkbenchApp();
const LazyApp = lazy(async () => {
  const module = await workbenchAppPromise;
  logRendererBoot('app:module-resolved');
  return { default: module.default };
});

createRoot(rootElement).render(
  <RootMode>
    <Suspense fallback={<WorkbenchShell />}>
      <LazyApp />
    </Suspense>
  </RootMode>,
);
logRendererBoot('react-root:render-called');

window.requestAnimationFrame(() => {
  logRendererBoot('raf:1');
  void workbenchAppPromise;
  void loadDeviceAnalysisApp();
});

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    logRendererBoot('raf:2');
    window.__CONDUCTOR_BOOT_LOG_NAVIGATION__?.();
    window.__CONDUCTOR_BOOT_LOG_RESOURCES__?.();
    dismissBootSplash();
  });
});
