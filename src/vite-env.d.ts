/// <reference types="vite/client" />

interface Window {
  __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
  __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
  __CONDUCTOR_BOOT_DISMISS_SPLASH__?: () => void;
  __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
  __CONDUCTOR_BOOT_LOG_NAVIGATION__?: () => void;
  __CONDUCTOR_BOOT_LOG_RESOURCES__?: () => void;
}
