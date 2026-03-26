const REQUIRED_DEVICE_ANALYSIS_STORE_METHODS = [
  "getDeviceAnalysisTemplates",
  "createDeviceAnalysisTemplate",
  "deleteDeviceAnalysisTemplate",
  "getDeviceAnalysisSettings",
  "updateDeviceAnalysisSettings",
  "getDeviceAnalysisPersistencePath",
  "updateDeviceAnalysisPersistencePath",
  "chooseDeviceAnalysisPersistencePath",
] as const;

type DeviceAnalysisStoreMethod =
  (typeof REQUIRED_DEVICE_ANALYSIS_STORE_METHODS)[number];

export type DeviceAnalysisDesktopStore = {
  [K in DeviceAnalysisStoreMethod]?: (...args: unknown[]) => unknown;
};

type JsonRecord = Record<string, unknown>;
type PersistencePathInfo = JsonRecord & { isConfigurable?: boolean };

declare global {
  interface Window {
    desktopStore?: DeviceAnalysisDesktopStore;
  }
}

export const DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE =
  "Desktop store bridge unavailable.";

const parseJsonBody = (body: unknown): JsonRecord | null => {
  if (!body) return null;

  try {
    if (typeof body === "string") {
      const parsed = JSON.parse(body) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as JsonRecord) : null;
    }

    if (typeof body === "object") {
      return body as JsonRecord;
    }

    return null;
  } catch {
    return null;
  }
};

export const getDesktopStore = (): DeviceAnalysisDesktopStore | null => {
  if (typeof window === "undefined") return null;

  const store = window.desktopStore;
  if (!store || typeof store !== "object") return null;

  return store;
};

export const getDesktopStoreMethod = (
  store: DeviceAnalysisDesktopStore,
  method: DeviceAnalysisStoreMethod,
): ((...args: unknown[]) => unknown) => {
  const fn = store?.[method];
  if (typeof fn !== "function") {
    throw new Error(DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE);
  }
  return fn;
};

const normalizePersistencePathInfo = (info: unknown): PersistencePathInfo => ({
  ...(info || {}),
  isConfigurable: true,
});

export const requestDeviceAnalysisDesktopStore = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const store = getDesktopStore();
  if (!store) {
    throw new Error(DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE);
  }

  const method = String(options.method || "GET").toUpperCase();

  if (endpoint === "/device-analysis/templates" && method === "GET") {
    return getDesktopStoreMethod(store, "getDeviceAnalysisTemplates")();
  }

  if (endpoint === "/device-analysis/templates" && method === "POST") {
    return getDesktopStoreMethod(store, "createDeviceAnalysisTemplate")(
      parseJsonBody(options.body) || {},
    );
  }

  if (
    endpoint.startsWith("/device-analysis/templates/") &&
    method === "DELETE"
  ) {
    const id = endpoint.split("/")[3];
    return getDesktopStoreMethod(store, "deleteDeviceAnalysisTemplate")(id);
  }

  if (endpoint === "/device-analysis/settings" && method === "GET") {
    return getDesktopStoreMethod(store, "getDeviceAnalysisSettings")();
  }

  if (endpoint === "/device-analysis/settings" && method === "PATCH") {
    return getDesktopStoreMethod(store, "updateDeviceAnalysisSettings")(
      parseJsonBody(options.body) || {},
    );
  }

  if (endpoint === "/device-analysis/persistence-path" && method === "GET") {
    const info = await getDesktopStoreMethod(store, "getDeviceAnalysisPersistencePath")();
    return normalizePersistencePathInfo(info);
  }

  if (endpoint === "/device-analysis/persistence-path" && method === "PATCH") {
    const payload = parseJsonBody(options.body) || {};
    const path = typeof payload.path === "string" ? payload.path : "";
    const info = await getDesktopStoreMethod(store, "updateDeviceAnalysisPersistencePath")(
      path,
    );
    return normalizePersistencePathInfo(info);
  }

  if (
    endpoint === "/device-analysis/persistence-path/choose" &&
    method === "POST"
  ) {
    const info = await getDesktopStoreMethod(store, "chooseDeviceAnalysisPersistencePath")();
    return normalizePersistencePathInfo(info);
  }

  throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
};
