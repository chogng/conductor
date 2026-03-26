let workbenchAppPromise: Promise<typeof import('./App')> | null = null;
let deviceAnalysisAppPromise:
  | Promise<typeof import('./features/device-analysis/DeviceAnalysisApp')>
  | null = null;

export const loadWorkbenchApp = () => {
  if (!workbenchAppPromise) {
    workbenchAppPromise = import('./App');
  }

  return workbenchAppPromise;
};

export const loadDeviceAnalysisApp = () => {
  if (!deviceAnalysisAppPromise) {
    deviceAnalysisAppPromise = import('./features/device-analysis/DeviceAnalysisApp');
  }

  return deviceAnalysisAppPromise;
};
