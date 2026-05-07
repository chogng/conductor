import { Fragment, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import type { LanguageCode } from 'src/cs/platform/language/common/language';
import type { ThemeMode } from 'src/cs/workbench/common/theme';
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
      appVersion?: string | null;
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

const formatBootError = (error: unknown) => {
  if (error instanceof Error) {
    return `(message=${error.message} stack=${String(error.stack ?? '').slice(0, 1200)})`;
  }

  return `(message=${String(error)})`;
};

window.addEventListener('error', (event) => {
  const message = event.error ? formatBootError(event.error) : `(message=${event.message})`;
  logRendererBoot('window:error', message);
});

window.addEventListener('unhandledrejection', (event) => {
  logRendererBoot('window:unhandledrejection', formatBootError(event.reason));
});

const isDesktopRenderer = window.desktopMeta?.isDesktop === true;
const RootMode =
  import.meta.env.DEV && isDesktopRenderer ? Fragment : StrictMode;
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element with id "root" was not found.');
}

logRendererBoot('main:module-evaluated');
logRendererBoot(
  'main:environment',
  `(href=${window.location.href} desktop=${isDesktopRenderer ? 'yes' : 'no'} dev=${import.meta.env.DEV ? 'yes' : 'no'} rootChildren=${rootElement.childElementCount})`,
);
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
  logRendererBoot(
    'raf:1',
    `(rootChildren=${rootElement.childElementCount} textLength=${(rootElement.textContent ?? '').length})`,
  );
});

window.requestAnimationFrame(() => {
  const rect = rootElement.getBoundingClientRect();
  logRendererBoot(
    'raf:2',
    `(rootChildren=${rootElement.childElementCount} textLength=${(rootElement.textContent ?? '').length} rootRect=${Math.round(rect.width)}x${Math.round(rect.height)})`,
  );
});

window.setTimeout(() => {
  const rect = rootElement.getBoundingClientRect();
  logRendererBoot(
    'timeout:1000',
    `(rootChildren=${rootElement.childElementCount} textLength=${(rootElement.textContent ?? '').length} rootRect=${Math.round(rect.width)}x${Math.round(rect.height)})`,
  );
}, 1000);
