import {
  type Dispatch,
  useCallback,
  useEffect,
  useMemo,
  type SetStateAction,
  useState,
  type MutableRefObject,
} from "react";
import {
  buildFileIdentityKey,
  buildItemKey,
  createCsvImporterFileId,
} from "../data/preview/csvImportUtils";
import type { DeviceAnalysisTemplateConfig } from "../session/device-analysis-session-context";
import type { ProcessedEntry, RawDataEntry } from "../shared/lib/sharedTypes";
import { DEVICE_ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT } from "./onboardingEvents";
import { DEVICE_ANALYSIS_ONBOARDING_STEPS } from "./deviceAnalysisOnboardingSteps";

const DEMO_FILE_PATHS = [
  "/demo/demo-01.csv",
  "/demo/demo-02.csv",
  "/demo/demo-03.csv",
  "/demo/demo-04.csv",
  "/demo/demo-05.csv",
  "/demo/demo-06.csv",
] as const;
const DEMO_TEMPLATE_NAME_FALLBACK = "demo-01";

const TEMPLATE_SAVE_MODE_STEP_IDS = new Set([
  "template-config",
  "template-name",
  "template-x-start",
  "template-x-end",
  "template-x-points",
  "template-select-columns",
  "template-save",
]);

const CELL_REFERENCE_PATTERN = /^[A-Za-z]+[1-9]\d*$/;

const clickElementById = (id: string): boolean => {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(id);
  if (!element || !(element instanceof HTMLElement)) return false;
  element.click();
  return true;
};

const revealElementById = (id: string): boolean => {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(id);
  if (!element || !(element instanceof HTMLElement)) return false;

  element.scrollIntoView({
    block: "center",
    inline: "nearest",
  });

  return true;
};

const isCellReferenceValue = (value: string): boolean =>
  CELL_REFERENCE_PATTERN.test(String(value ?? "").trim());

const isXDataEndValue = (value: string): boolean => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === "end") return true;
  return isCellReferenceValue(trimmed);
};

const getColumnIndexFromCellReference = (value: string): number | null => {
  const match = String(value ?? "")
    .trim()
    .match(/^([A-Za-z]+)[1-9]\d*$/);
  if (!match) return null;

  let columnIndex = 0;
  const letters = match[1].toUpperCase();
  for (const char of letters) {
    columnIndex = columnIndex * 26 + (char.charCodeAt(0) - 64);
  }

  return columnIndex > 0 ? columnIndex - 1 : null;
};

type UseDeviceAnalysisOnboardingOptions = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  importerRef: MutableRefObject<{ openFileDialog?: () => void } | null>;
  navigateToPage: (page: "data" | "analysis" | "settings") => void;
  processingState?: string;
  processedData: ProcessedEntry[];
  rawData: RawDataEntry[];
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  setRawData: Dispatch<SetStateAction<RawDataEntry[]>>;
  setSelectedPreviewFileId: Dispatch<SetStateAction<string | null>>;
  setTemplateConfig: Dispatch<SetStateAction<DeviceAnalysisTemplateConfig>>;
  templateConfig: DeviceAnalysisTemplateConfig;
  updateSettings: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

export const useDeviceAnalysisOnboarding = ({
  clearPreviewState,
  importerRef,
  navigateToPage,
  processingState,
  processedData,
  rawData,
  setProcessedData,
  setRawData,
  setSelectedPreviewFileId,
  setTemplateConfig,
  templateConfig,
  updateSettings,
}: UseDeviceAnalysisOnboardingOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [launchMode, setLaunchMode] = useState<"auto" | "manual">("manual");
  const [templateSaveCount, setTemplateSaveCount] = useState(0);

  const steps = DEVICE_ANALYSIS_ONBOARDING_STEPS;

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
      navigateToPage("data");
    },
    [navigateToPage],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    setTemplateSaveCount(0);

    if (launchMode === "auto") {
      void persistState({ onboardingAutoStartDismissed: true });
    }
  }, [launchMode, persistState]);

  const finish = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
    setTemplateSaveCount(0);
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

    const currentStep = steps[stepIndex];
    if (currentStep?.id === "template-name") {
      const currentTemplateName = String(templateConfig?.name ?? "").trim();
      if (!currentTemplateName) {
        setTemplateConfig((prev) => ({
          ...prev,
          name: DEMO_TEMPLATE_NAME_FALLBACK,
        }));
      }
    }

    if (
      isOpen &&
      currentStep?.id === "template" &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(DEVICE_ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT),
      );
    }

    setStepIndex((prev) => prev + 1);
  }, [
    finish,
    isOpen,
    setTemplateConfig,
    stepIndex,
    steps,
    templateConfig?.name,
  ]);

  const back = useCallback(() => {
    const currentStep = steps[stepIndex];
    if (isOpen && currentStep?.id === "template-config") {
      clickElementById("device-analysis-template-mode-tab-select");
    }

    setStepIndex((prev) => Math.max(0, prev - 1));
  }, [isOpen, stepIndex, steps]);

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

  const handleOpenOrigin = useCallback((openOrigin: () => void) => {
    const currentStep = steps[stepIndex];
    openOrigin();
    if (isOpen && currentStep?.id === "origin-export") {
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    }
  }, [isOpen, stepIndex, steps]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;

    const isClickWithinButton = (
      eventTarget: Node,
      buttonId: string,
    ): boolean => {
      const button = document.getElementById(buttonId);
      if (!(button instanceof HTMLElement)) {
        return false;
      }
      return eventTarget === button || button.contains(eventTarget);
    };

    const handleTemplateSaveClick = (event: MouseEvent) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Node)) {
        return;
      }
      const clickedSaveButton = isClickWithinButton(
        eventTarget,
        "device-analysis-template-save-btn",
      );
      if (clickedSaveButton) {
        setTemplateSaveCount((prev) => prev + 1);
      }

      if (clickedSaveButton) {
        setStepIndex((prev) => {
          if (steps[prev]?.id !== "template-save") {
            return prev;
          }
          return Math.min(prev + 1, steps.length - 1);
        });
        return;
      }

      const clickedApplyToAllButton = isClickWithinButton(
        eventTarget,
        "device-analysis-template-apply-to-all",
      );
      if (clickedApplyToAllButton) {
        setStepIndex((prev) => {
          const currentStepId = steps[prev]?.id;
          if (currentStepId === "template-save") {
            return Math.min(prev + 2, steps.length - 1);
          }
          if (currentStepId === "apply") {
            return Math.min(prev + 1, steps.length - 1);
          }
          return prev;
        });
      }
    };

    document.addEventListener("click", handleTemplateSaveClick, true);
    return () => {
      document.removeEventListener("click", handleTemplateSaveClick, true);
    };
  }, [isOpen, steps]);

  useEffect(() => {
    if (!isOpen) return;
    const currentStep = steps[stepIndex];
    if (!currentStep) return;
    navigateToPage(currentStep.page);
  }, [isOpen, navigateToPage, stepIndex, steps]);

  useEffect(() => {
    if (!isOpen) return;
    const currentStep = steps[stepIndex];
    if (!currentStep) return;

    const timeoutIds: number[] = [];
    const shouldForceSaveMode =
      TEMPLATE_SAVE_MODE_STEP_IDS.has(currentStep.id) &&
      !(currentStep.id === "template-save" && templateSaveCount > 0);

    if (shouldForceSaveMode) {
      timeoutIds.push(
        window.setTimeout(() => {
          clickElementById("device-analysis-template-mode-tab-save");
        }, 120),
      );
    }

    if (currentStep.focusTargetId) {
      const baseDelay = shouldForceSaveMode ? 220 : 80;
      timeoutIds.push(
        window.setTimeout(() => {
          revealElementById(currentStep.focusTargetId as string);
        }, baseDelay),
      );
      timeoutIds.push(
        window.setTimeout(() => {
          revealElementById(currentStep.focusTargetId as string);
        }, baseDelay + 180),
      );
    }

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [isOpen, stepIndex, steps, templateSaveCount]);

  const canNext = useMemo(() => {
    if (!isOpen) return true;

    const currentStep = steps[stepIndex];
    if (!currentStep) return true;

    switch (currentStep.id) {
      case "import":
        return rawData.length > 0;
      case "template-name":
        return true;
      case "template-x-start":
        return isCellReferenceValue(templateConfig?.xDataStart ?? "");
      case "template-x-end":
        return isXDataEndValue(templateConfig?.xDataEnd ?? "");
      case "template-x-points":
        return true;
      case "template-select-columns":
        return Array.isArray(templateConfig?.selectedColumns)
          ? templateConfig.selectedColumns.some(
              (columnIndex) =>
                columnIndex !==
                getColumnIndexFromCellReference(templateConfig?.xDataStart ?? ""),
            )
          : false;
      case "template-save":
        return templateSaveCount > 0;
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
    templateConfig,
    templateSaveCount,
  ]);

  return useMemo(
    () => ({
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
    }),
    [
      back,
      canNext,
      close,
      handleImportTrigger,
      handleOpenOrigin,
      isOpen,
      next,
      open,
      stepIndex,
      steps,
    ],
  );
};
