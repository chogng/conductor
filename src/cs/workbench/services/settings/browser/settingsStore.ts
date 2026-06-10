/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  CONDUCTOR_STORE_UNAVAILABLE,
  type ConductorStoreBridge,
  getConductorStoreBridge,
  getConductorStoreMethod,
} from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreIpcClient";

const wrapSettingsStoreError = (error: unknown): never => {
  if (
    error instanceof Error &&
    error.message === CONDUCTOR_STORE_UNAVAILABLE
  ) {
    throw new Error(
      "Desktop store bridge unavailable. Conductor settings are persisted only via desktop config.json.",
    );
  }

  throw error;
};

const requireDesktopSettingsStore = (): ConductorStoreBridge => {
  const store = getConductorStoreBridge();
  if (!store) {
    throw new Error(
      "Desktop store bridge unavailable. Conductor settings are persisted only via desktop config.json.",
    );
  }

  return store;
};

export const getSettings = async (): Promise<unknown> => {
  const store = requireDesktopSettingsStore();

  try {
    return await getConductorStoreMethod(
      store,
      "getConductorSettings",
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
    return await getConductorStoreMethod(
      store,
      "updateConductorSettings",
    )(updates);
  } catch (error) {
    wrapSettingsStoreError(error);
  }
};
