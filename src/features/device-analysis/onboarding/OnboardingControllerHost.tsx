import { useEffect } from "react";
import type {
  DeviceAnalysisTemplateConfig,
} from "../session/device-analysis-session-context";
import type { ProcessedEntry, RawDataEntry } from "../shared/lib/sharedTypes";
import { useDeviceAnalysisOnboarding } from "./useDeviceAnalysisOnboarding";
import { loadDeviceAnalysisOnboarding } from "./loadDeviceAnalysisOnboarding";

type OnboardingPage = "data" | "analysis" | "settings";

type OnboardingControllerState = {
  back: () => void;
  canNext: boolean;
  close: () => void;
  handleImportTrigger: () => void;
  handleOpenOrigin: (openOrigin: () => void) => void;
  isOpen: boolean;
  next: () => void;
  open: (mode: "auto" | "manual") => void;
  stepIndex: number;
  steps: ReturnType<typeof useDeviceAnalysisOnboarding>["steps"];
};

type OnboardingControllerHostProps = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  importerRef: React.MutableRefObject<{ openFileDialog?: () => void } | null>;
  isRequestedOpen: boolean;
  openMode: "auto" | "manual";
  navigateToPage: (page: OnboardingPage) => void;
  onStateChange: (state: OnboardingControllerState) => void;
  processingState?: string;
  processedData: ProcessedEntry[];
  rawData: RawDataEntry[];
  setProcessedData: React.Dispatch<React.SetStateAction<ProcessedEntry[]>>;
  setRawData: React.Dispatch<React.SetStateAction<RawDataEntry[]>>;
  setSelectedPreviewFileId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  setTemplateConfig: React.Dispatch<
    React.SetStateAction<DeviceAnalysisTemplateConfig>
  >;
  templateConfig: DeviceAnalysisTemplateConfig;
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
  const onboarding = useDeviceAnalysisOnboarding({
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
    onStateChange({
      ...onboarding,
      open: onboarding.open,
    });
  }, [onStateChange, onboarding]);

  useEffect(() => {
    if (!isRequestedOpen || onboarding.isOpen) return;

    void loadDeviceAnalysisOnboarding();
    onboarding.open(openMode);
  }, [isRequestedOpen, onboarding, openMode]);

  return null;
};

export default OnboardingControllerHost;
