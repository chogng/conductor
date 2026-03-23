import {
  type Dispatch,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type SetStateAction,
  useState,
  type MutableRefObject,
} from "react";
import {
  buildFileIdentityKey,
  buildItemKey,
  createCsvImporterFileId,
} from "../data/preview/csvImportUtils";
import type { ProcessedEntry, RawDataEntry } from "../shared/lib/sharedTypes";
import { DEVICE_ANALYSIS_ONBOARDING_STEPS } from "./deviceAnalysisOnboardingSteps";

const DEMO_FILE_PATHS = [
  "/demo/demo-01.csv",
  "/demo/demo-02.csv",
  "/demo/demo-03.csv",
  "/demo/demo-04.csv",
  "/demo/demo-05.csv",
  "/demo/demo-06.csv",
] as const;

const clickElementById = (id: string): boolean => {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(id);
  if (!element || !(element instanceof HTMLElement)) return false;
  element.click();
  return true;
};

const getInputValueById = (id: string): string => {
  if (typeof document === "undefined") return "";
  const element = document.getElementById(id);
  if (!element) return "";
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return String(element.value ?? "").trim();
  }
  return "";
};

type UseDeviceAnalysisOnboardingOptions = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  deviceAnalysisSettings?: Record<string, unknown> | null;
  importerRef: MutableRefObject<{ openFileDialog?: () => void } | null>;
  navigateToPage: (page: "data" | "analysis" | "settings") => void;
  processingState?: string;
  processedData: ProcessedEntry[];
  rawData: RawDataEntry[];
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  setRawData: Dispatch<SetStateAction<RawDataEntry[]>>;
  setSelectedPreviewFileId: Dispatch<SetStateAction<string | null>>;
  updateSettings: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

export const useDeviceAnalysisOnboarding = ({
  clearPreviewState,
  deviceAnalysisSettings,
  importerRef,
  navigateToPage,
  processingState,
  processedData,
  rawData,
  setProcessedData,
  setRawData,
  setSelectedPreviewFileId,
  updateSettings,
}: UseDeviceAnalysisOnboardingOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [launchMode, setLaunchMode] = useState<"auto" | "manual">("manual");
  const [originLaunchCount, setOriginLaunchCount] = useState(0);
  const [templateSaveCount, setTemplateSaveCount] = useState(0);
  const autoAdvanceStateRef = useRef<{
    stepId: string | null;
    shouldAdvance: boolean;
  }>({
    stepId: null,
    shouldAdvance: false,
  });

  const steps = DEVICE_ANALYSIS_ONBOARDING_STEPS;
  const onboardingCompleted = Boolean(deviceAnalysisSettings?.onboardingCompleted);
  const onboardingAutoStartDismissed = Boolean(
    deviceAnalysisSettings?.onboardingAutoStartDismissed,
  );

  const persistState = useCallback(
    async (updates: Record<string, unknown>) => {
      try {
        await updateSettings(updates);
      } catch {
        // Non-blocking
      }
    },
    [updateSettings],
  );

  const open = useCallback(
    (mode: "auto" | "manual") => {
      setLaunchMode(mode);
      setStepIndex(0);
      setIsOpen(true);
      setTemplateSaveCount(0);
      setOriginLaunchCount(0);
      navigateToPage("data");
    },
    [navigateToPage],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    setTemplateSaveCount(0);
    setOriginLaunchCount(0);

    if (launchMode === "auto") {
      void persistState({ onboardingAutoStartDismissed: true });
    }
  }, [launchMode, persistState]);

  const finish = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    setTemplateSaveCount(0);
    setOriginLaunchCount(0);
    void persistState({
      onboardingCompleted: true,
      onboardingAutoStartDismissed: true,
    });
  }, [persistState]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((prev) => prev + 1);
  }, [finish, stepIndex, steps.length]);

  const back = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const importDemoFiles = useCallback(async () => {
    const importedEntries = await Promise.all(
      DEMO_FILE_PATHS.map(async (pathValue, index) => {
        const response = await fetch(pathValue);
        if (!response.ok) {
          throw new Error(`Failed to load demo file: ${pathValue}`);
        }

        const blob = await response.blob();
        const fileName = pathValue.split("/").pop() || `demo-${index + 1}.csv`;
        const file = new File([blob], fileName, {
          type: "text/csv;charset=utf-8",
          lastModified: Date.UTC(2026, 0, index + 1),
        });
        const sourceKey = buildFileIdentityKey(file);
        if (!sourceKey) return null;

        return {
          file,
          fileId: createCsvImporterFileId(),
          fileName,
          itemKey: buildItemKey(file),
          sourceKey,
          size: file.size,
          lastModified: file.lastModified,
        };
      }),
    );

    const nextEntries = importedEntries.filter(
      (
        entry,
      ): entry is RawDataEntry & {
        file: File;
        fileId: string;
        fileName: string;
        itemKey: string;
        sourceKey: string;
        size: number;
        lastModified: number;
      } => Boolean(entry),
    );

    if (nextEntries.length === 0) return;

    setRawData(nextEntries);
    setProcessedData([]);
    clearPreviewState({ clearSelection: true });
    setSelectedPreviewFileId(nextEntries[0].fileId as string);
  }, [
    clearPreviewState,
    setProcessedData,
    setRawData,
    setSelectedPreviewFileId,
  ]);

  const handleImportTrigger = useCallback(() => {
    const currentStep = steps[stepIndex];
    const isGuidedImportStep = isOpen && currentStep?.id === "import";

    if (isGuidedImportStep) {
      void importDemoFiles();
      return;
    }

    importerRef.current?.openFileDialog?.();
  }, [importDemoFiles, importerRef, isOpen, stepIndex, steps]);

  const handleOpenOrigin = useCallback(
    (openOrigin: () => void) => {
      setOriginLaunchCount((prev) => prev + 1);
      openOrigin();
    },
    [],
  );

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;

    const saveButton = document.getElementById("device-analysis-template-save-btn");
    if (!(saveButton instanceof HTMLElement)) return undefined;

    const handleTemplateSave = () => {
      setTemplateSaveCount((prev) => prev + 1);
    };

    saveButton.addEventListener("click", handleTemplateSave);
    return () => {
      saveButton.removeEventListener("click", handleTemplateSave);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const currentStep = steps[stepIndex];
    if (!currentStep) return;
    navigateToPage(currentStep.page);
  }, [isOpen, navigateToPage, stepIndex, steps]);

  useEffect(() => {
    if (!isOpen) return;
    const currentStep = steps[stepIndex];
    if (!currentStep || currentStep.id !== "template-config") return;

    const timeoutId = window.setTimeout(() => {
      clickElementById("device-analysis-template-mode-tab-save");
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, stepIndex, steps]);

  useEffect(() => {
    if (!isOpen) return;
    const currentStep = steps[stepIndex];
    if (!currentStep) return;

    let shouldAdvance = false;

    switch (currentStep.id) {
      case "import":
        shouldAdvance = rawData.length > 0;
        break;
      case "template-config":
        shouldAdvance = Boolean(
          getInputValueById("device-analysis-template-x-data-start") &&
            getInputValueById("device-analysis-template-y-data-start"),
        );
        break;
      case "template-select-columns":
        if (typeof document !== "undefined") {
          shouldAdvance =
            document.querySelectorAll(
              "#device-analysis-preview-canvas-grid th[data-selected='true']",
            ).length > 0;
        }
        break;
      case "template-save":
        shouldAdvance =
          Boolean(getInputValueById("device-analysis-template-name")) &&
          templateSaveCount > 0;
        break;
      case "apply":
        shouldAdvance =
          processingState === "processing" || processedData.length > 0;
        break;
      case "origin-export":
        shouldAdvance = originLaunchCount > 0;
        break;
      default:
        break;
    }

    const previousAutoAdvanceState = autoAdvanceStateRef.current;
    const autoAdvanceEnabled = currentStep.id !== "import";
    const shouldAutoAdvance =
      autoAdvanceEnabled &&
      previousAutoAdvanceState.stepId === currentStep.id &&
      previousAutoAdvanceState.shouldAdvance === false &&
      shouldAdvance === true;

    autoAdvanceStateRef.current = {
      stepId: currentStep.id,
      shouldAdvance,
    };

    if (!shouldAutoAdvance) return;

    const timeoutId = window.setTimeout(() => {
      setStepIndex((prev) => {
        if (prev !== stepIndex) return prev;
        return Math.min(prev + 1, steps.length - 1);
      });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [
    isOpen,
    originLaunchCount,
    processedData.length,
    processingState,
    rawData.length,
    stepIndex,
    steps,
    templateSaveCount,
  ]);

  useEffect(() => {
    if (!deviceAnalysisSettings) return;
    if (onboardingCompleted || onboardingAutoStartDismissed) return;
    if (rawData.length > 0 || processedData.length > 0) return;
    open("auto");
  }, [
    deviceAnalysisSettings,
    onboardingAutoStartDismissed,
    onboardingCompleted,
    open,
    processedData.length,
    rawData.length,
  ]);

  const canNext = useMemo(() => {
    if (!isOpen) return true;

    const currentStep = steps[stepIndex];
    if (!currentStep) return true;

    switch (currentStep.id) {
      case "import":
        return rawData.length > 0;
      case "template-config":
        return Boolean(
          getInputValueById("device-analysis-template-x-data-start") &&
            getInputValueById("device-analysis-template-y-data-start"),
        );
      case "template-select-columns":
        if (typeof document === "undefined") return false;
        return (
          document.querySelectorAll(
            "#device-analysis-preview-canvas-grid th[data-selected='true']",
          ).length > 0
        );
      case "template-save":
        return (
          Boolean(getInputValueById("device-analysis-template-name")) &&
          templateSaveCount > 0
        );
      case "apply":
        return processingState === "processing" || processedData.length > 0;
      default:
        return true;
    }
  }, [
    isOpen,
    processedData.length,
    processingState,
    rawData.length,
    stepIndex,
    steps,
    templateSaveCount,
  ]);

  return {
    canNext,
    close,
    handleImportTrigger,
    handleOpenOrigin,
    isOpen,
    next,
    open,
    stepIndex,
    steps,
    back,
  };
};
