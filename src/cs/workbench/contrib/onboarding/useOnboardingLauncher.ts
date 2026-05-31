import { disposableTimeout } from "src/cs/base/common/async";
import type { AnalysisSettings } from "src/cs/workbench/contrib/settings/settingsShared";
import type { OnboardingLaunchMode } from "src/cs/workbench/contrib/onboarding/onboardingState";

type UseOnboardingLauncherParams = {
  analysisSettings: AnalysisSettings | null;
  onboardingIsOpen: boolean;
  prefetchOnboarding: () => void;
  processedDataCount: number;
  rawDataCount: number;
};

export const createOnboardingLauncher = ({
  analysisSettings,
  onboardingIsOpen,
  prefetchOnboarding,
  processedDataCount,
  rawDataCount,
}: UseOnboardingLauncherParams) => {
  let shouldMountOnboardingController = false;
  let pendingOnboardingOpenMode: OnboardingLaunchMode | null = null;

  const hasOnboardingSessionData =
    rawDataCount > 0 || processedDataCount > 0;
  const shouldAutoStartOnboarding =
    Boolean(analysisSettings) &&
    !Boolean(analysisSettings?.onboardingCompleted) &&
    !Boolean(analysisSettings?.onboardingAutoStartDismissed) &&
    !hasOnboardingSessionData;

  const open = (mode: OnboardingLaunchMode) => {
    shouldMountOnboardingController = true;
    pendingOnboardingOpenMode = mode;
    prefetchOnboarding();
  };

  if (shouldAutoStartOnboarding && !onboardingIsOpen) {
    const scheduleAutoOpen = () => open("auto");
    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      window.requestIdleCallback(scheduleAutoOpen, { timeout: 1200 });
    } else {
      disposableTimeout(scheduleAutoOpen, 320);
    }
  }

  const handleOpenOnboardingGuide = () => open("manual");

  const setPendingOnboardingOpenMode = (mode: OnboardingLaunchMode | null) => {
    pendingOnboardingOpenMode = mode;
  };

  return {
    handleOpenOnboardingGuide,
    hasOnboardingSessionData,
    get pendingOnboardingOpenMode() {
      return pendingOnboardingOpenMode;
    },
    setPendingOnboardingOpenMode,
    get shouldMountOnboardingController() {
      return shouldMountOnboardingController;
    },
  };
};

export const useOnboardingLauncher = createOnboardingLauncher;
