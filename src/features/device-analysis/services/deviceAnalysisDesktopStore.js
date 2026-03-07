const REQUIRED_DEVICE_ANALYSIS_STORE_METHODS = [
  "getDeviceAnalysisTemplates",
  "createDeviceAnalysisTemplate",
  "deleteDeviceAnalysisTemplate",
  "getDeviceAnalysisSettings",
  "updateDeviceAnalysisSettings",
  "getDeviceAnalysisPersistencePath",
  "updateDeviceAnalysisPersistencePath",
  "chooseDeviceAnalysisPersistencePath",
];

export const DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE =
  "Desktop store bridge unavailable.";

const parseJsonBody = (body) => {
  if (!body) return null;

  try {
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return null;
  }
};

const getDesktopStore = () => {
  if (typeof window === "undefined") return null;

  const store = window.desktopStore;
  if (!store || typeof store !== "object") return null;

  for (const method of REQUIRED_DEVICE_ANALYSIS_STORE_METHODS) {
    if (typeof store[method] !== "function") return null;
  }

  return store;
};

const normalizePersistencePathInfo = (info) => ({
  ...(info || {}),
  isConfigurable: true,
});

export const requestDeviceAnalysisDesktopStore = async (
  endpoint,
  options = {},
) => {
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
    const info = await store.updateDeviceAnalysisPersistencePath(
      payload?.path ?? "",
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
