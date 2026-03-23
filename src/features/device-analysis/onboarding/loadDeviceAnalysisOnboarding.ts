type DeviceAnalysisOnboardingModule = typeof import("./DeviceAnalysisOnboarding");

let deviceAnalysisOnboardingModulePromise: Promise<DeviceAnalysisOnboardingModule> | null =
  null;

export const loadDeviceAnalysisOnboarding =
  (): Promise<DeviceAnalysisOnboardingModule> => {
    if (!deviceAnalysisOnboardingModulePromise) {
      deviceAnalysisOnboardingModulePromise = import("./DeviceAnalysisOnboarding");
    }

    return deviceAnalysisOnboardingModulePromise;
  };
