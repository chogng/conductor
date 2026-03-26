import {
  DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE,
  type DeviceAnalysisDesktopStore,
  getDesktopStore,
  getDesktopStoreMethod,
} from "../desktop/deviceAnalysisDesktopStore";

const wrapSettingsStoreError = (error: unknown): never => {
  if (
    error instanceof Error &&
    error.message === DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE
  ) {
    throw new Error(
      "Desktop store bridge unavailable. Device Analysis settings are persisted only via desktop config.json.",
    );
  }

  throw error;
};

const requireDesktopSettingsStore = (): DeviceAnalysisDesktopStore => {
  const store = getDesktopStore();
  if (!store) {
    throw new Error(
      "Desktop store bridge unavailable. Device Analysis settings are persisted only via desktop config.json.",
    );
  }

  return store;
};

export const getDeviceAnalysisSettings = async (): Promise<unknown> => {
  const store = requireDesktopSettingsStore();

  try {
    return await getDesktopStoreMethod(
      store,
      "getDeviceAnalysisSettings",
    )();
  } catch (error) {
    wrapSettingsStoreError(error);
  }
};

export const updateDeviceAnalysisSettings = async (
  updates: unknown,
): Promise<unknown> => {
  const store = requireDesktopSettingsStore();

  try {
    return await getDesktopStoreMethod(
      store,
      "updateDeviceAnalysisSettings",
    )(updates);
  } catch (error) {
    wrapSettingsStoreError(error);
  }
};
