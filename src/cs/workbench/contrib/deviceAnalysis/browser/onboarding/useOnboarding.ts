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
import type { TemplateConfig } from "../session/analysis-session-context";
import type { ProcessedEntry, RawDataEntry } from "../shared/lib/sharedTypes";
import { ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT } from "./onboardingEvents";
import { ONBOARDING_STEPS } from "./onboardingSteps";

const DEMO_FILE_PATHS = [
  "/demo/demo-01.csv",
  "/demo/demo-02.csv",
  "/demo/demo-03.csv",
  "/demo/demo-04.csv",
  "/demo/demo-05.csv",
  "/demo/demo-06.csv",
] as const;
const DEMO_TEMPLATE_NAME_FALLBACK = "demo-01";

type DesktopDemoFileEntry = {
  fileName?: string;
  lastModified?: number;
  path?: string;
  size?: number;
  text?: string;
};

type ImportedDemoRawDataEntry = RawDataEntry & {
  file: File;
  fileId: string;
  fileName: string;
  itemKey: string;
  lastModified: number;
  size: number;
  sourceKey: string;
  sourcePath: string | null;
};

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

type UseOnboardingOptions = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  importerRef: MutableRefObject<{ openFileDialog?: () => void } | null>;
  navigateToPage: (page: "data" | "analysis" | "settings") => void;
  processingState?: string;
  processedData: ProcessedEntry[];
  rawData: RawDataEntry[];
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  setRawData: Dispatch<SetStateAction<RawDataEntry[]>>;
  setSelectedPreviewFileId: Dispatch<SetStateAction<string | null>>;
  setTemplateConfig: Dispatch<SetStateAction<TemplateConfig>>;
  templateConfig: TemplateConfig;
  updateSettings: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

export const useOnboarding = ({
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
}: UseOnboardingOptions) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [launchMode, setLaunchMode] = useState<"auto" | "manual">("manual");

  const steps = ONBOARDING_STEPS;

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
      navigateToPage("data");
    },
    [navigateToPage],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);

    if (launchMode === "auto") {
      void persistState({ onboardingAutoStartDismissed: true });
    }
  }, [launchMode, persistState]);

  const finish = useCallback(() => {
    setIsOpen(false);
    setStepIndex(0);
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
    if (currentStep?.id === "template") {
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
        new CustomEvent(ANALYSIS_ONBOARDING_CREATE_TEMPLATE_EVENT),
      );
    }

    if (isOpen && currentStep?.id === "apply") {
      const clicked = clickElementById(
        "analysis-template-output-rule-apply-to-all",
      );
      if (!clicked) {
        setStepIndex((prev) => prev + 1);
      }
      return;
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
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const importDemoFiles = useCallback(async () => {
    const desktopDemoFiles =
      await globalThis.window?.desktopImport?.getDeviceAnalysisDemoFiles?.();
    const desktopEntries = Array.isArray(desktopDemoFiles?.files)
      ? desktopDemoFiles.files.filter(
          (entry): entry is DesktopDemoFileEntry =>
            typeof entry?.fileName === "string" &&
            typeof entry?.text === "string",
        )
      : [];
    const demoSources =
      desktopEntries.length > 0
        ? desktopEntries.map((entry, index) => ({
            fileName: entry.fileName || `demo-${index + 1}.csv`,
            lastModified:
              Number.isFinite(Number(entry.lastModified))
                ? Number(entry.lastModified)
                : Date.UTC(2026, 0, index + 1),
            sourcePath: typeof entry.path === "string" ? entry.path : null,
            text: entry.text || "",
          }))
        : await Promise.all(
            DEMO_FILE_PATHS.map(async (pathValue, index) => {
              const response = await fetch(pathValue);
              if (!response.ok) {
                throw new Error(`Failed to load demo file: ${pathValue}`);
              }

              const text = await response.text();
              const fileName =
                pathValue.split("/").pop() || `demo-${index + 1}.csv`;
              return {
                fileName,
                lastModified: Date.UTC(2026, 0, index + 1),
                sourcePath: null,
                text,
              };
            }),
          );

    const importedEntries = demoSources.map((source) => {
      const file = new File([source.text], source.fileName, {
        type: "text/csv;charset=utf-8",
        lastModified: source.lastModified,
      });
      const sourceKey = buildFileIdentityKey(file);
      if (!sourceKey) return null;

      return {
        file,
        fileId: createCsvImporterFileId(),
        fileName: source.fileName,
        itemKey: buildItemKey(file),
        sourcePath: source.sourcePath,
        sourceKey,
        size: file.size,
        lastModified: file.lastModified,
      };
    });

    const nextEntries = importedEntries.filter(
      (entry): entry is ImportedDemoRawDataEntry => Boolean(entry),
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

      const clickedApplyToAllButton = isClickWithinButton(
        eventTarget,
        "analysis-template-output-rule-apply-to-all",
      );
      if (clickedApplyToAllButton) {
        setStepIndex((prev) => {
          const currentStepId = steps[prev]?.id;
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

    if (currentStep.id === "template") {
      timeoutIds.push(
        window.setTimeout(() => {
          clickElementById("analysis-template-mode-tab-select");
        }, 40),
      );
      timeoutIds.push(
        window.setTimeout(() => {
          clickElementById("analysis-template-dropdown-btn");
        }, 140),
      );
    }

    if (currentStep.id === "template-custom") {
      timeoutIds.push(
        window.setTimeout(() => {
          clickElementById("analysis-template-mode-tab-save");
        }, 40),
      );
    }

    if (currentStep.id === "apply") {
      timeoutIds.push(
        window.setTimeout(() => {
          clickElementById("analysis-template-mode-tab-select");
        }, 40),
      );
    }

    if (currentStep.focusTargetId) {
      const baseDelay = 80;
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
  }, [isOpen, stepIndex, steps]);

  const canNext = useMemo(() => {
    if (!isOpen) return true;

    const currentStep = steps[stepIndex];
    if (!currentStep) return true;

    switch (currentStep.id) {
      case "import":
        return rawData.length > 0;
      default:
        return true;
    }
  }, [
    isOpen,
    rawData.length,
    stepIndex,
    steps,
    templateConfig,
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
