import type { MutableRef } from "src/cs/base/common/ref";
import type { StateSetter, TemplateConfig } from "src/cs/workbench/contrib/session/analysis-session-context";
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
  importerRef: MutableRef<{ openFileDialog?: () => void } | null>;
  navigateToPage: (page: "data" | "analysis" | "settings") => void;
  processingState?: string;
  processedData: ProcessedEntry[];
  rawData: RawDataEntry[];
  setProcessedData: StateSetter<ProcessedEntry[]>;
  setRawData: StateSetter<RawDataEntry[]>;
  setSelectedPreviewFileId: StateSetter<string | null>;
  setTemplateConfig: StateSetter<TemplateConfig>;
  templateConfig: TemplateConfig;
  updateSettings: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

const scheduleStepEffects = (
  stepIndex: number,
): void => {
  const currentStep = ONBOARDING_STEPS[stepIndex];
  if (!currentStep || typeof window === "undefined") return;

  if (currentStep.id === "template") {
    window.setTimeout(openTemplateSelectModeForOnboarding, 40);
    window.setTimeout(openTemplateDropdownForOnboarding, 140);
  }

  if (currentStep.id === "template-custom") {
    window.setTimeout(openTemplateSaveModeForOnboarding, 40);
  }

  if (currentStep.id === "apply") {
    window.setTimeout(openTemplateSelectModeForOnboarding, 40);
  }

  if (currentStep.focusTargetId) {
    window.setTimeout(() => revealElementById(currentStep.focusTargetId as string), 80);
    window.setTimeout(() => revealElementById(currentStep.focusTargetId as string), 260);
  }
};

export const createOnboarding = ({
  clearPreviewState,
  importerRef,
  navigateToPage,
  processedData,
  rawData,
  setProcessedData,
  setRawData,
  setSelectedPreviewFileId,
  setTemplateConfig,
  templateConfig,
  updateSettings,
}: UseOnboardingOptions) => {
  let isOpen = false;
  let stepIndex = 0;
  let launchMode: "auto" | "manual" = "manual";

  const persistState = async (updates: Record<string, unknown>) => {
    try {
      await updateSettings(updates);
    } catch {
      // Onboarding persistence is non-blocking.
    }
  };

  const open = (mode: "auto" | "manual") => {
    launchMode = mode;
    stepIndex = 0;
    isOpen = true;
    navigateToPage("data");
    scheduleStepEffects(stepIndex);
  };

  const close = () => {
    isOpen = false;
    stepIndex = 0;

    if (launchMode === "auto") {
      void persistState({ onboardingAutoStartDismissed: true });
    }
  };

  const finish = () => {
    isOpen = false;
    stepIndex = 0;
    void persistState({
      onboardingCompleted: true,
      onboardingAutoStartDismissed: true,
    });
  };

  const setStep = (nextIndex: number) => {
    stepIndex = Math.max(0, Math.min(nextIndex, ONBOARDING_STEPS.length - 1));
    const currentStep = ONBOARDING_STEPS[stepIndex];
    if (isOpen && currentStep) {
      navigateToPage(currentStep.page);
      scheduleStepEffects(stepIndex);
    }
  };

  const next = () => {
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      finish();
      return;
    }

    const currentStep = ONBOARDING_STEPS[stepIndex];
    if (currentStep?.id === "template") {
      const currentTemplateName = String(templateConfig?.name ?? "").trim();
      if (!currentTemplateName) {
        setTemplateConfig((prev) => ({
          ...prev,
          name: DEMO_TEMPLATE_NAME_FALLBACK,
        }));
      }
      if (isOpen) {
        createTemplateForOnboarding();
      }
    }

    if (isOpen && currentStep?.id === "apply") {
      const clicked = applyTemplateToAllForOnboarding();
      if (!clicked) {
        setStep(stepIndex + 1);
      }
      return;
    }

    setStep(stepIndex + 1);
  };

  const back = () => {
    setStep(stepIndex - 1);
  };

  const importDemoFiles = async () => {
    const nextEntries = await importDemoRawDataEntries();
    if (nextEntries.length === 0) return;

    setRawData(nextEntries);
    setProcessedData([]);
    clearPreviewState({ clearSelection: true });
    setSelectedPreviewFileId(nextEntries[0].fileId as string);
  };

  const handleImportTrigger = () => {
    const currentStep = ONBOARDING_STEPS[stepIndex];
    const isGuidedImportStep = isOpen && currentStep?.id === "import";

    if (isGuidedImportStep) {
      void importDemoFiles();
      return;
    }

    importerRef.current?.openFileDialog?.();
  };

  const handleOpenOrigin = (openOrigin: () => void) => {
    const currentStep = ONBOARDING_STEPS[stepIndex];
    openOrigin();
    if (isOpen && currentStep?.id === "origin-export") {
      setStep(stepIndex + 1);
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("click", (event) => {
      if (!isOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      const button = document.getElementById("analysis-template-output-rule-apply-to-all");
      if (!(button instanceof HTMLElement)) return;
      if (target !== button && !button.contains(target)) return;
      if (ONBOARDING_STEPS[stepIndex]?.id === "apply") {
        setStep(stepIndex + 1);
      }
    }, true);
  }

  return {
    get canNext() {
      const currentStep = ONBOARDING_STEPS[stepIndex];
      return currentStep?.id === "import" ? rawData.length > 0 : true;
    },
    close,
    handleImportTrigger,
    handleOpenOrigin,
    get isOpen() {
      return isOpen;
    },
    next,
    open,
    get stepIndex() {
      return stepIndex;
    },
    steps: ONBOARDING_STEPS,
    back,
  };
};

export const useOnboarding = createOnboarding;
