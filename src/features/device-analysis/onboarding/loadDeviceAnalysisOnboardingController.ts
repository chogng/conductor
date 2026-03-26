type DeviceAnalysisOnboardingControllerModule =
  typeof import("./OnboardingControllerHost");

let deviceAnalysisOnboardingControllerPromise:
  | Promise<DeviceAnalysisOnboardingControllerModule>
  | null = null;

export const loadDeviceAnalysisOnboardingController =
  (): Promise<DeviceAnalysisOnboardingControllerModule> => {
    if (!deviceAnalysisOnboardingControllerPromise) {
      deviceAnalysisOnboardingControllerPromise = import(
        "./OnboardingControllerHost"
      );
    }

    return deviceAnalysisOnboardingControllerPromise;
  };
