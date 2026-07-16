/// <reference types="vite/client" />

type MochaTestCallback = () => void | Promise<void>;

declare function suite(name: string, callback: MochaTestCallback): void;
declare function test(name: string, callback: MochaTestCallback): void;

interface Window {
  conductor?: {
    ipcRenderer?: unknown;
    process?: {
      memoryInfo?: () => Promise<{
        heapLimitBytes: number;
        heapUsedBytes: number;
        processPrivateBytes: number;
        processResidentSetBytes?: number;
        systemFreeBytes: number;
        systemTotalBytes: number;
      }>;
    };
    webUtils?: unknown;
    context?: {
      configuration?: () => {
        initialWorkbenchSettings?: Record<string, unknown> | null;
        storage?: {
          profileId: string;
          workspaceId: string;
          initial: {
            application: Record<string, string>;
            profile: Record<string, string>;
            workspace: Record<string, string>;
          };
        };
      } | undefined;
    };
  };
  __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
  __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
  __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
}
