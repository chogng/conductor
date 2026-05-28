import { useCallback, useEffect, useState } from "react";
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

export const useOnboardingLauncher = ({
  analysisSettings,
  onboardingIsOpen,
  prefetchOnboarding,
  processedDataCount,
  rawDataCount,
}: UseOnboardingLauncherParams) => {
  const [shouldMountOnboardingController, setShouldMountOnboardingController] =
    useState(false);
  const [pendingOnboardingOpenMode, setPendingOnboardingOpenMode] =
    useState<OnboardingLaunchMode | null>(null);

  const hasOnboardingSessionData =
    rawDataCount > 0 || processedDataCount > 0;
  const shouldAutoStartOnboarding =
    Boolean(analysisSettings) &&
    !Boolean(analysisSettings?.onboardingCompleted) &&
    !Boolean(analysisSettings?.onboardingAutoStartDismissed) &&
    !hasOnboardingSessionData;

  useEffect(() => {
    if (!shouldAutoStartOnboarding || onboardingIsOpen) {
      return undefined;
    }

    const scheduleAutoOpen = () => {
      setShouldMountOnboardingController(true);
      setPendingOnboardingOpenMode("auto");
      prefetchOnboarding();
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      const idleId = window.requestIdleCallback(scheduleAutoOpen, {
        timeout: 1200,
      });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    return disposableTimeout(scheduleAutoOpen, 320).dispose;
  }, [onboardingIsOpen, prefetchOnboarding, shouldAutoStartOnboarding]);

  const handleOpenOnboardingGuide = useCallback(() => {
    setShouldMountOnboardingController(true);
    setPendingOnboardingOpenMode("manual");
    prefetchOnboarding();
  }, [prefetchOnboarding]);

  return {
    handleOpenOnboardingGuide,
    hasOnboardingSessionData,
    pendingOnboardingOpenMode,
    setPendingOnboardingOpenMode,
    shouldMountOnboardingController,
  };
};
