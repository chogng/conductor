/// <reference types="vite/client" />

interface Window {
  desktopBoot?: {
    markUiReady?: (source?: string) => Promise<unknown>;
  };
  __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
  __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
  __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
}
