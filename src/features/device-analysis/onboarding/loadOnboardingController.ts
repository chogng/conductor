type OnboardingControllerModule =
  typeof import("./OnboardingControllerHost");

let onboardingControllerPromise:
  | Promise<OnboardingControllerModule>
  | null = null;

export const loadOnboardingController =
  (): Promise<OnboardingControllerModule> => {
    if (!onboardingControllerPromise) {
      onboardingControllerPromise = import(
        "./OnboardingControllerHost"
      );
    }

    return onboardingControllerPromise;
  };
