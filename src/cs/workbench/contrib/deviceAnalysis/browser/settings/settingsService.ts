import {
  DESKTOP_STORE_UNAVAILABLE,
  type AnalysisDesktopStore,
  getDesktopStore,
  getDesktopStoreMethod,
} from "../desktop/desktopStore";

const wrapSettingsStoreError = (error: unknown): never => {
  if (
    error instanceof Error &&
    error.message === DESKTOP_STORE_UNAVAILABLE
  ) {
    throw new Error(
      "Desktop store bridge unavailable. Device Analysis settings are persisted only via desktop config.json.",
    );
  }

  throw error;
};

const requireDesktopSettingsStore = (): AnalysisDesktopStore => {
  const store = getDesktopStore();
  if (!store) {
    throw new Error(
      "Desktop store bridge unavailable. Device Analysis settings are persisted only via desktop config.json.",
    );
  }

  return store;
};

export const getSettings = async (): Promise<unknown> => {
  const store = requireDesktopSettingsStore();

  try {
    return await getDesktopStoreMethod(
      store,
      "getAnalysisSettings",
      "getSettings",
    )();
  } catch (error) {
    wrapSettingsStoreError(error);
  }
};

export const updateSettings = async (
  updates: unknown,
): Promise<unknown> => {
  const store = requireDesktopSettingsStore();

  try {
    return await getDesktopStoreMethod(
      store,
      "updateAnalysisSettings",
      "updateSettings",
    )(updates);
  } catch (error) {
    wrapSettingsStoreError(error);
  }
};
