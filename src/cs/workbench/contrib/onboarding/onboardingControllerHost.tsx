import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ProcessedEntry, RawDataEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { TemplateConfig } from "src/cs/workbench/contrib/session/analysis-session-context";
import type {
  OnboardingControllerState,
  OnboardingLaunchMode,
} from "src/cs/workbench/contrib/onboarding/onboardingState";
import { useOnboarding } from "src/cs/workbench/contrib/onboarding/useOnboarding";
import { loadOnboarding } from "src/cs/workbench/contrib/onboarding/onboardingLoader";

type OnboardingPage = "data" | "analysis" | "settings";

type OnboardingControllerHostProps = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  importerRef: MutableRefObject<{ openFileDialog?: () => void } | null>;
  isRequestedOpen: boolean;
  openMode: OnboardingLaunchMode;
  navigateToPage: (page: OnboardingPage) => void;
  onStateChange: (state: OnboardingControllerState) => void;
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

const OnboardingControllerHost = ({
  clearPreviewState,
  importerRef,
  isRequestedOpen,
  openMode,
  navigateToPage,
  onStateChange,
  processingState,
  processedData,
  rawData,
  setProcessedData,
  setRawData,
  setSelectedPreviewFileId,
  setTemplateConfig,
  templateConfig,
  updateSettings,
}: OnboardingControllerHostProps) => {
  const onboarding = useOnboarding({
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
  });

  useEffect(() => {
    onStateChange(onboarding);
  }, [onStateChange, onboarding]);

  useEffect(() => {
    if (!isRequestedOpen || onboarding.isOpen) return;

    void loadOnboarding();
    onboarding.open(openMode);
  }, [isRequestedOpen, onboarding, openMode]);

  return null;
};

export default OnboardingControllerHost;
