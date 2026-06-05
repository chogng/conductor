/// <reference types="vite/client" />

type MochaTestCallback = () => void | Promise<void>;

declare function suite(name: string, callback: MochaTestCallback): void;
declare function test(name: string, callback: MochaTestCallback): void;

interface Window {
  conductor?: {
    ipcRenderer?: unknown;
    webUtils?: unknown;
    context?: {
      configuration?: () => {
        initialWorkbenchSettings?: Record<string, unknown> | null;
      } | undefined;
    };
  };
  __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
  __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
  __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
}
