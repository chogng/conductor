type OnboardingModule = typeof import("./Onboarding");

let onboardingModulePromise: Promise<OnboardingModule> | null =
  null;

export const loadOnboarding =
  (): Promise<OnboardingModule> => {
    if (!onboardingModulePromise) {
      onboardingModulePromise = import("./Onboarding");
    }

    return onboardingModulePromise;
  };
