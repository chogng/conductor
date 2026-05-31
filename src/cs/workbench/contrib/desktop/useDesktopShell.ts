import { useCallback, useEffect, useState } from "react";

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
        ? ((candidate as { channel: DesktopAutoUpdateStatus["channel"] }).channel)
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

export const useDesktopShell = ({
  handleExport,
  importerRef,
  isWindowsDesktopShell = false,
}: UseDesktopShellOptions) => {
  const [autoUpdateStatus, setAutoUpdateStatus] =
    useState<DesktopAutoUpdateStatus>(() =>
      import.meta.env.DEV
        ? { status: "downloaded", version: "preview" }
        : DEFAULT_AUTO_UPDATE_STATUS,
    );
  const sendDesktopCommand = useCallback((command: string): boolean => {
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
  }, []);

  const handleToggleDevTools = useCallback(() => {
    sendDesktopCommand("toggle-devtools");
  }, [sendDesktopCommand]);

  const handleReloadWindow = useCallback(() => {
    if (sendDesktopCommand("reload-window")) return;
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [sendDesktopCommand]);

  const handleMinimizeWindow = useCallback(() => {
    sendDesktopCommand("minimize-window");
  }, [sendDesktopCommand]);

  const handleToggleMaximizeWindow = useCallback(() => {
    sendDesktopCommand("toggle-maximize-window");
  }, [sendDesktopCommand]);

  const handleCloseWindow = useCallback(() => {
    sendDesktopCommand("close-window");
  }, [sendDesktopCommand]);

  const handleCheckForUpdates = useCallback((): boolean => {
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
    if (typeof desktopApp?.checkForUpdates === "function") {
      void desktopApp.checkForUpdates();
      return true;
    }
    return sendDesktopCommand("check-for-updates");
  }, [sendDesktopCommand]);

  const handleCheckForUpdatesAndInstall = useCallback((): boolean => {
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
    if (typeof desktopApp?.checkForUpdatesAndInstall === "function") {
      void desktopApp.checkForUpdatesAndInstall();
      return true;
    }
    return sendDesktopCommand("check-for-updates-and-install");
  }, [sendDesktopCommand]);

  const handleInstallDownloadedUpdate = useCallback((): boolean => {
    const desktopApp = typeof window !== "undefined" ? window.desktopApp : undefined;
    if (typeof desktopApp?.installDownloadedUpdate === "function") {
      void desktopApp.installDownloadedUpdate();
      return true;
    }
    return sendDesktopCommand("install-downloaded-update");
  }, [sendDesktopCommand]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const desktopApp = window.desktopApp;
    if (!desktopApp) return undefined;

    if (typeof desktopApp.getAutoUpdateStatus === "function") {
      setAutoUpdateStatus(
        normalizeAutoUpdateStatus(desktopApp.getAutoUpdateStatus()),
      );
    }

    if (typeof desktopApp.onAutoUpdateStatusChange !== "function") {
      return undefined;
    }

    const unsubscribe = desktopApp.onAutoUpdateStatusChange((status) => {
      setAutoUpdateStatus(normalizeAutoUpdateStatus(status));
    });

    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, []);

  useEffect(() => {
    if (!isWindowsDesktopShell) return undefined;

    const handleDesktopShortcuts = (event: KeyboardEvent) => {
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
    };

    window.addEventListener("keydown", handleDesktopShortcuts);
    return () => {
      window.removeEventListener("keydown", handleDesktopShortcuts);
    };
  }, [
    handleExport,
    handleReloadWindow,
    handleToggleDevTools,
    importerRef,
    isWindowsDesktopShell,
  ]);

  return {
    autoUpdateStatus,
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
