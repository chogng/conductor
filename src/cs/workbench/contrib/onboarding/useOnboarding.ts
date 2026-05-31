import {
  type Dispatch,
  useCallback,
  useEffect,
  useMemo,
  type SetStateAction,
  useState,
  type MutableRefObject,
} from "react";
import type { TemplateConfig } from "src/cs/workbench/contrib/session/analysis-session-context";
import type { ProcessedEntry, RawDataEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { importDemoRawDataEntries } from "src/cs/workbench/contrib/data/demoDataImport";
import {
  applyTemplateToAllForOnboarding,
  createTemplateForOnboarding,
  openTemplateDropdownForOnboarding,
  openTemplateSaveModeForOnboarding,
  openTemplateSelectModeForOnboarding,
} from "src/cs/workbench/contrib/template/browser/templateOnboardingActions";
import { ONBOARDING_STEPS } from "src/cs/workbench/contrib/onboarding/onboardingSteps";

const DEMO_TEMPLATE_NAME_FALLBACK = "demo-01";

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

    if (isOpen && currentStep?.id === "template") {
      createTemplateForOnboarding();
    }

    if (isOpen && currentStep?.id === "apply") {
      const clicked = applyTemplateToAllForOnboarding();
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
    const nextEntries = await importDemoRawDataEntries();
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
          openTemplateSelectModeForOnboarding();
        }, 40),
      );
      timeoutIds.push(
        window.setTimeout(() => {
          openTemplateDropdownForOnboarding();
        }, 140),
      );
    }

    if (currentStep.id === "template-custom") {
      timeoutIds.push(
        window.setTimeout(() => {
          openTemplateSaveModeForOnboarding();
        }, 40),
      );
    }

    if (currentStep.id === "apply") {
      timeoutIds.push(
        window.setTimeout(() => {
          openTemplateSelectModeForOnboarding();
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
