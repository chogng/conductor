import { Fragment, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import type { LanguageCode } from './config/language';
import type { ThemeMode } from './config/theme';
import { loadWorkbenchApp } from './workbench-loader';

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
    desktopBoot?: {
      markUiReady?: (source?: string) => Promise<unknown>;
    };
    __CONDUCTOR_NAV_MODE_INIT__?: boolean;
    __CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__?: Record<string, unknown> | null;
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
    __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
    __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
  }
}

const logRendererBoot = (stage: string, extra = '') => {
  window.__CONDUCTOR_BOOT_LOG__?.(stage, extra);
};

const isDesktopRenderer = window.desktopMeta?.isDesktop === true;
const RootMode =
  import.meta.env.DEV && isDesktopRenderer ? Fragment : StrictMode;
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
    <Suspense fallback={null}>
      <LazyApp />
    </Suspense>
  </RootMode>,
);
logRendererBoot('react-root:render-called');

window.requestAnimationFrame(() => {
  logRendererBoot('raf:1');
});

window.requestAnimationFrame(() => {
  logRendererBoot('raf:2');
});
