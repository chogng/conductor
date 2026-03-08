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

type DeviceAnalysisDesktopStore = {
  [K in DeviceAnalysisStoreMethod]: (...args: unknown[]) => unknown;
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

const getDesktopStore = (): DeviceAnalysisDesktopStore | null => {
  if (typeof window === "undefined") return null;

  const store = window.desktopStore;
  if (!store || typeof store !== "object") return null;

  for (const method of REQUIRED_DEVICE_ANALYSIS_STORE_METHODS) {
    if (typeof store[method] !== "function") return null;
  }

  return store;
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
    return store.getDeviceAnalysisTemplates();
  }

  if (endpoint === "/device-analysis/templates" && method === "POST") {
    return store.createDeviceAnalysisTemplate(parseJsonBody(options.body) || {});
  }

  if (
    endpoint.startsWith("/device-analysis/templates/") &&
    method === "DELETE"
  ) {
    const id = endpoint.split("/")[3];
    return store.deleteDeviceAnalysisTemplate(id);
  }

  if (endpoint === "/device-analysis/settings" && method === "GET") {
    return store.getDeviceAnalysisSettings();
  }

  if (endpoint === "/device-analysis/settings" && method === "PATCH") {
    return store.updateDeviceAnalysisSettings(parseJsonBody(options.body) || {});
  }

  if (endpoint === "/device-analysis/persistence-path" && method === "GET") {
    const info = await store.getDeviceAnalysisPersistencePath();
    return normalizePersistencePathInfo(info);
  }

  if (endpoint === "/device-analysis/persistence-path" && method === "PATCH") {
    const payload = parseJsonBody(options.body) || {};
    const path = typeof payload.path === "string" ? payload.path : "";
    const info = await store.updateDeviceAnalysisPersistencePath(
      path,
    );
    return normalizePersistencePathInfo(info);
  }

  if (
    endpoint === "/device-analysis/persistence-path/choose" &&
    method === "POST"
  ) {
    const info = await store.chooseDeviceAnalysisPersistencePath();
    return normalizePersistencePathInfo(info);
  }

  throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
};
