type DesktopAppBridge = {
  sendCommand: (command: string) => void;
  getAutoUpdateStatus?: () => unknown;
  checkForUpdates?: () => Promise<unknown>;
  checkForUpdatesAndInstall?: () => Promise<unknown>;
  installDownloadedUpdate?: () => Promise<unknown>;
  onAutoUpdateStatusChange?: (
    listener: (status: unknown) => void,
  ) => (() => void) | void;
};

export type DesktopAutoUpdateStatus = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloaded"
    | "error"
    | "disabled"
    | "unsupported";
  version: string | null;
  channel?: "github" | "generic" | "store" | "none" | "unsupported";
  isStoreManaged?: boolean;
  message?: string | null;
};

type ImporterRefLike = {
  current: {
    openFileDialog?: () => void;
  } | null;
};

type UseDesktopShellOptions = {
  handleExport: () => Promise<unknown> | unknown;
  importerRef: ImporterRefLike;
  isWindowsDesktopShell?: boolean;
};

declare global {
  interface Window {
    desktopApp?: DesktopAppBridge;
  }
}

const DEFAULT_AUTO_UPDATE_STATUS: DesktopAutoUpdateStatus = {
  status: "idle",
  version: null,
};

const normalizeAutoUpdateStatus = (
  value: unknown,
): DesktopAutoUpdateStatus => {
  if (!value || typeof value !== "object") {
    return DEFAULT_AUTO_UPDATE_STATUS;
  }

  const candidate = value as {
    status?: unknown;
    version?: unknown;
  };

  return {
    status:
      typeof candidate.status === "string" && candidate.status.trim()
        ? (candidate.status as DesktopAutoUpdateStatus["status"])
        : "idle",
    version:
      typeof candidate.version === "string" && candidate.version.trim()
        ? candidate.version.trim()
        : null,
    channel:
      typeof (candidate as { channel?: unknown }).channel === "string"
        ? (candidate as { channel: DesktopAutoUpdateStatus["channel"] }).channel
        : "none",
    isStoreManaged:
      (candidate as { isStoreManaged?: unknown }).isStoreManaged === true,
    message:
      typeof (candidate as { message?: unknown }).message === "string" &&
      (candidate as { message: string }).message.trim()
        ? (candidate as { message: string }).message.trim()
        : null,
  };
};

const readAutoUpdateStatus = (): DesktopAutoUpdateStatus => {
  if (import.meta.env.DEV) {
    return { status: "downloaded", version: "preview" };
  }
  const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
  return normalizeAutoUpdateStatus(desktopApp?.getAutoUpdateStatus?.());
};

export const createDesktopShell = ({
  handleExport,
  importerRef,
  isWindowsDesktopShell = false,
}: UseDesktopShellOptions) => {
  let autoUpdateStatus = readAutoUpdateStatus();

  const sendDesktopCommand = (command: string): boolean => {
    if (typeof window === "undefined") return false;

    const desktopApp = window.desktopApp;
    if (
      !desktopApp ||
      typeof desktopApp.sendCommand !== "function" ||
      typeof command !== "string"
    ) {
      return false;
    }

    desktopApp.sendCommand(command);
    return true;
  };

  const handleToggleDevTools = () => {
    sendDesktopCommand("toggle-devtools");
  };

  const handleReloadWindow = () => {
    if (sendDesktopCommand("reload-window")) return;
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const handleMinimizeWindow = () => {
    sendDesktopCommand("minimize-window");
  };

  const handleToggleMaximizeWindow = () => {
    sendDesktopCommand("toggle-maximize-window");
  };

  const handleCloseWindow = () => {
    sendDesktopCommand("close-window");
  };

  const handleCheckForUpdates = (): boolean => {
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
    if (typeof desktopApp?.checkForUpdates === "function") {
      void desktopApp.checkForUpdates();
      return true;
    }
    return sendDesktopCommand("check-for-updates");
  };

  const handleCheckForUpdatesAndInstall = (): boolean => {
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
    if (typeof desktopApp?.checkForUpdatesAndInstall === "function") {
      void desktopApp.checkForUpdatesAndInstall();
      return true;
    }
    return sendDesktopCommand("check-for-updates-and-install");
  };

  const handleInstallDownloadedUpdate = (): boolean => {
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
    if (typeof desktopApp?.installDownloadedUpdate === "function") {
      void desktopApp.installDownloadedUpdate();
      return true;
    }
    return sendDesktopCommand("install-downloaded-update");
  };

  const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
  if (desktopApp?.onAutoUpdateStatusChange) {
    desktopApp.onAutoUpdateStatusChange((status) => {
      autoUpdateStatus = normalizeAutoUpdateStatus(status);
    });
  }

  if (typeof window !== "undefined" && isWindowsDesktopShell) {
    const existingListenerFlag = "__conductorDesktopShellShortcuts";
    const state = window as unknown as Record<string, unknown>;
    if (!state[existingListenerFlag]) {
      state[existingListenerFlag] = true;
      window.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.metaKey || event.altKey) return;

        const key = String(event.key || "").toLowerCase();

        if (event.ctrlKey && !event.shiftKey && key === "o") {
          event.preventDefault();
          importerRef.current?.openFileDialog?.();
          return;
        }

        if (event.ctrlKey && event.shiftKey && key === "e") {
          event.preventDefault();
          void handleExport();
          return;
        }

        if (key === "f5") {
          event.preventDefault();
          handleReloadWindow();
          return;
        }

        if (key === "f12") {
          event.preventDefault();
          handleToggleDevTools();
        }
      });
    }
  }

  return {
    get autoUpdateStatus() {
      return autoUpdateStatus;
    },
    handleCheckForUpdatesAndInstall,
    handleCheckForUpdates,
    handleCloseWindow,
    handleInstallDownloadedUpdate,
    handleMinimizeWindow,
    handleReloadWindow,
    handleToggleDevTools,
    handleToggleMaximizeWindow,
  };
};

export const useDesktopShell = createDesktopShell;
