import { useCallback, useEffect } from "react";

type DesktopAppBridge = {
  sendCommand: (command: string) => void;
};

type ImporterRefLike = {
  current: {
    openFileDialog?: () => void;
  } | null;
};

type UseDeviceAnalysisDesktopShellOptions = {
  handleExport: () => Promise<unknown> | unknown;
  importerRef: ImporterRefLike;
  isWindowsDesktopShell?: boolean;
  setActivePage: (nextPage: string) => void;
};

declare global {
  interface Window {
    desktopApp?: DesktopAppBridge;
  }
}

export const useDeviceAnalysisDesktopShell = ({
  handleExport,
  importerRef,
  isWindowsDesktopShell = false,
  setActivePage,
}: UseDeviceAnalysisDesktopShellOptions) => {
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

  const handleOpenOriginFromTitleBar = useCallback(() => {
    setActivePage("analysis");

    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("device-analysis:open-origin"));
      });
    });
  }, [setActivePage]);

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
    return sendDesktopCommand("check-for-updates");
  }, [sendDesktopCommand]);

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
    handleCheckForUpdates,
    handleCloseWindow,
    handleMinimizeWindow,
    handleOpenOriginFromTitleBar,
    handleReloadWindow,
    handleToggleDevTools,
    handleToggleMaximizeWindow,
  };
};
