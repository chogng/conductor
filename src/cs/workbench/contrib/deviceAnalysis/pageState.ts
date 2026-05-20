import type { MutableRefObject } from "react";
import type { CsvImporterRef } from "src/cs/workbench/contrib/import/CsvImporter";
import type { OnboardingStep } from "src/cs/workbench/contrib/deviceAnalysis/onboarding/onboardingTypes";

export type PageTab = "data" | "analysis" | "settings";

export type PageNavigationState = {
  activePage: PageTab;
  history: PageTab[];
  historyIndex: number;
};

export type ProcessingExtractionError = {
  fileName?: string;
  message: string;
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type OnboardingLaunchMode = "auto" | "manual";

export type OnboardingControllerState = {
  back: () => void;
  canNext: boolean;
  close: () => void;
  handleImportTrigger: () => void;
  handleOpenOrigin: (openOrigin: () => void) => void;
  isOpen: boolean;
  next: () => void;
  open: (mode: OnboardingLaunchMode) => void;
  stepIndex: number;
  steps: OnboardingStep[];
};

export type AnalysisFileOption = {
  label: string;
  value: string;
};

export const INITIAL_PAGE_NAVIGATION_STATE: PageNavigationState = {
  activePage: "data",
  history: ["data"],
  historyIndex: 0,
};

export const stripCsvExtension = (fileName: string): string => {
  const normalized = String(fileName ?? "").trim();
  if (!normalized) {
    return normalized;
  }

  const withoutCsv = normalized.replace(/\.csv$/i, "");
  return withoutCsv.length > 0 ? withoutCsv : normalized;
};

export const createIdleOnboardingState = (
  importerRef: MutableRefObject<CsvImporterRef | null>,
): OnboardingControllerState => ({
  back: () => {},
  canNext: true,
  close: () => {},
  handleImportTrigger: () => {
    importerRef.current?.openFileDialog?.();
  },
  handleOpenOrigin: (openOrigin) => {
    openOrigin();
  },
  isOpen: false,
  next: () => {},
  open: () => {},
  stepIndex: 0,
  steps: [],
});

export const navigatePageNavigation = (
  prevState: PageNavigationState,
  nextPage: PageTab,
): PageNavigationState => {
  if (prevState.activePage === nextPage) {
    return prevState;
  }

  const truncatedHistory = prevState.history.slice(
    0,
    prevState.historyIndex + 1,
  );
  const nextHistory = [...truncatedHistory, nextPage];

  return {
    activePage: nextPage,
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
};

export const navigateBackPageNavigation = (
  prevState: PageNavigationState,
): PageNavigationState => {
  if (prevState.historyIndex <= 0) {
    return prevState;
  }

  const nextIndex = prevState.historyIndex - 1;
  return {
    ...prevState,
    activePage: prevState.history[nextIndex],
    historyIndex: nextIndex,
  };
};

export const navigateForwardPageNavigation = (
  prevState: PageNavigationState,
): PageNavigationState => {
  if (prevState.historyIndex >= prevState.history.length - 1) {
    return prevState;
  }

  const nextIndex = prevState.historyIndex + 1;
  return {
    ...prevState,
    activePage: prevState.history[nextIndex],
    historyIndex: nextIndex,
  };
};

export const isPageTab = (value: string): value is PageTab =>
  value === "data" || value === "analysis" || value === "settings";

export const getAnalysisShellFlags = () => {
  const desktopMeta =
    typeof window !== "undefined" ? window.desktopMeta ?? null : null;
  const isWindowsDesktopShell =
    desktopMeta?.isDesktop === true && desktopMeta?.platform === "win32";
  const isPackagedWindowsDesktopShell =
    isWindowsDesktopShell && desktopMeta?.isPackaged === true;

  return {
    desktopMeta,
    isAppUpdatePreviewEnabled:
      isPackagedWindowsDesktopShell || import.meta.env.DEV,
    isDesktopChromePreviewEnabled: isWindowsDesktopShell || import.meta.env.DEV,
    isPackagedWindowsDesktopShell,
    isWindowsDesktopShell,
  };
};

export const getAnalysisFileOptions = (
  processedData: Array<{
    fileId?: unknown;
    fileName?: unknown;
  }> | null | undefined,
): AnalysisFileOption[] =>
  (Array.isArray(processedData) ? processedData : [])
    .map((entry) => {
      const fileId =
        typeof entry?.fileId === "string"
          ? entry.fileId
          : String(entry?.fileId ?? "");
      const fileNameRaw = entry?.fileName;
      const fileName =
        typeof fileNameRaw === "string" && fileNameRaw.trim().length > 0
          ? fileNameRaw
          : fileId;
      const displayName = stripCsvExtension(fileName);
      if (!fileId) {
        return null;
      }

      return { value: fileId, label: displayName };
    })
    .filter((entry): entry is AnalysisFileOption => !!entry);
