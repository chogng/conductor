import type { MutableRefObject } from "react";
import type { ImporterRef } from "src/cs/workbench/contrib/import/browser/importerView";
import type { OnboardingStep } from "src/cs/workbench/contrib/deviceAnalysis/onboarding/onboardingTypes";

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

export const createIdleOnboardingState = (
  importerRef: MutableRefObject<ImporterRef | null>,
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
