type OnboardingModule =
  typeof import("src/cs/workbench/contrib/onboarding/onboardingView");
type OnboardingControllerModule =
  typeof import("src/cs/workbench/contrib/onboarding/onboardingControllerHost");

let onboardingModulePromise: Promise<OnboardingModule> | null = null;
let onboardingControllerPromise: Promise<OnboardingControllerModule> | null =
  null;

export const loadOnboarding = (): Promise<OnboardingModule> => {
  if (!onboardingModulePromise) {
    onboardingModulePromise = import(
      "src/cs/workbench/contrib/onboarding/onboardingView"
    );
  }

  return onboardingModulePromise;
};

export const loadOnboardingController =
  (): Promise<OnboardingControllerModule> => {
    if (!onboardingControllerPromise) {
      onboardingControllerPromise = import(
        "src/cs/workbench/contrib/onboarding/onboardingControllerHost"
      );
    }

    return onboardingControllerPromise;
  };
