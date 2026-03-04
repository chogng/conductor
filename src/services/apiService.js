// Production-like default: same-origin API (works with backend-served dist and with Vite proxy in dev)
const DEFAULT_API_BASE_URL = "/api";
const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

// Development mode: optional mock API.
const DEV_MOCK_API =
  import.meta.env?.DEV &&
  String(import.meta.env?.VITE_MOCK_API || "").toLowerCase() === "true";

let didWarnMockApi = false;
let didWarnDesktopFallback = false;
let didWarnLocalFallback = false;

const DEVICE_ANALYSIS_LOCAL_STORAGE_KEY = "device-analysis:local-data:v1";
const DEVICE_ANALYSIS_BROWSER_PERSISTENCE_LABEL = `localStorage key: ${DEVICE_ANALYSIS_LOCAL_STORAGE_KEY}`;

const SS_METHODS = new Set(["auto", "manual", "idWindow", "legacy"]);
const Y_UNITS = new Set(["A", "uA", "nA"]);

const DEFAULT_DEVICE_ANALYSIS_SETTINGS = {
  defaultTemplate: null,
  lastTemplateId: null,
  stopOnErrorDefault: false,
  yUnit: "A",
  ssMethodDefault: "auto",
  ssDiagnosticsEnabled: true,
  ssShowFitLine: true,
  ssIdLow: 1e-11,
  ssIdHigh: 1e-9,
};

const canUseStorage = () =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined" &&
  window.localStorage !== null;

const getDesktopStore = () => {
  if (typeof window === "undefined") return null;
  const store = window.desktopStore;
  if (!store || typeof store !== "object") return null;

  const requiredMethods = [
    "getDeviceAnalysisTemplates",
    "createDeviceAnalysisTemplate",
    "deleteDeviceAnalysisTemplate",
    "getDeviceAnalysisSettings",
    "updateDeviceAnalysisSettings",
    "getDeviceAnalysisPersistencePath",
    "updateDeviceAnalysisPersistencePath",
    "chooseDeviceAnalysisPersistencePath",
  ];

  for (const method of requiredMethods) {
    if (typeof store[method] !== "function") return null;
  }

  return store;
};

const normalizePositiveNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const normalizeSettings = (raw) => {
  const next = raw && typeof raw === "object" ? { ...raw } : {};

  const ssMethodDefault = SS_METHODS.has(next.ssMethodDefault)
    ? next.ssMethodDefault
    : SS_METHODS.has(next.ssMethod)
      ? next.ssMethod
      : DEFAULT_DEVICE_ANALYSIS_SETTINGS.ssMethodDefault;

  const yUnit = Y_UNITS.has(next.yUnit)
    ? next.yUnit
    : DEFAULT_DEVICE_ANALYSIS_SETTINGS.yUnit;

  const ssDiagnosticsEnabled =
    typeof next.ssDiagnosticsEnabled === "boolean"
      ? next.ssDiagnosticsEnabled
      : DEFAULT_DEVICE_ANALYSIS_SETTINGS.ssDiagnosticsEnabled;

  const ssShowFitLine =
    typeof next.ssShowFitLine === "boolean"
      ? next.ssShowFitLine
      : DEFAULT_DEVICE_ANALYSIS_SETTINGS.ssShowFitLine;

  const stopOnErrorDefault =
    typeof next.stopOnErrorDefault === "boolean"
      ? next.stopOnErrorDefault
      : DEFAULT_DEVICE_ANALYSIS_SETTINGS.stopOnErrorDefault;

  const ssIdLow = normalizePositiveNumber(
    next.ssIdLow ?? next.ssIdWindowLow,
    DEFAULT_DEVICE_ANALYSIS_SETTINGS.ssIdLow,
  );
  const ssIdHigh = normalizePositiveNumber(
    next.ssIdHigh ?? next.ssIdWindowHigh,
    DEFAULT_DEVICE_ANALYSIS_SETTINGS.ssIdHigh,
  );

  return {
    ...DEFAULT_DEVICE_ANALYSIS_SETTINGS,
    ...next,
    defaultTemplate: next.defaultTemplate ?? null,
    lastTemplateId: next.lastTemplateId ?? null,
    stopOnErrorDefault,
    yUnit,
    ssMethodDefault,
    ssDiagnosticsEnabled,
    ssShowFitLine,
    ssIdLow,
    ssIdHigh,
  };
};

const cloneTemplate = (template) => {
  if (!template || typeof template !== "object") return null;

  return {
    ...template,
    selectedColumns: Array.isArray(template.selectedColumns)
      ? template.selectedColumns.map((n) => Number(n)).filter(Number.isFinite)
      : [],
  };
};

const normalizeTemplates = (templates) => {
  if (!Array.isArray(templates)) return [];

  return templates
    .map((template) => cloneTemplate(template))
    .filter(Boolean)
    .map((template, index) => ({
      ...template,
      id: template.id || `tpl_local_${index}_${Date.now()}`,
    }));
};

const readDeviceAnalysisLocalData = () => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(DEVICE_ANALYSIS_LOCAL_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      templates: normalizeTemplates(parsed.templates),
      settings: normalizeSettings(parsed.settings),
    };
  } catch {
    return null;
  }
};

const writeDeviceAnalysisLocalData = (data) => {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(
      DEVICE_ANALYSIS_LOCAL_STORAGE_KEY,
      JSON.stringify({
        templates: normalizeTemplates(data?.templates),
        settings: normalizeSettings(data?.settings),
      }),
    );
  } catch {
    // ignore storage errors
  }
};

const buildInitialMockData = () => {
  const stored = readDeviceAnalysisLocalData();

  return {
    templates: normalizeTemplates(stored?.templates),
    settings: normalizeSettings(stored?.settings),
  };
};

let MOCK_DATA = buildInitialMockData();

const persistMockData = () => {
  writeDeviceAnalysisLocalData({
    templates: MOCK_DATA.templates,
    settings: MOCK_DATA.settings,
  });
};

const buildBrowserPersistenceInfo = () => ({
  currentPath: DEVICE_ANALYSIS_BROWSER_PERSISTENCE_LABEL,
  defaultPath: DEVICE_ANALYSIS_BROWSER_PERSISTENCE_LABEL,
  isCustom: false,
  isConfigurable: false,
});

const parseJsonBody = (body) => {
  if (!body) return null;
  try {
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return null;
  }
};

class ApiService {
  async request(endpoint, options = {}) {
    if (DEV_MOCK_API) {
      if (!didWarnMockApi) {
        didWarnMockApi = true;
        console.warn(
          "[apiService] VITE_MOCK_API=true: using mock API (backend will not be called).",
        );
      }
      if (this._canUseDesktopStoreForEndpoint(endpoint)) {
        return this._desktopStoreRequest(endpoint, options);
      }
      return this._mockRequest(endpoint, options);
    }

    const isFormData =
      typeof FormData !== "undefined" && options?.body instanceof FormData;

    const headers = { ...(options.headers || {}) };
    const hasContentTypeHeader =
      Object.prototype.hasOwnProperty.call(headers, "Content-Type") ||
      Object.prototype.hasOwnProperty.call(headers, "content-type");

    if (!isFormData && !hasContentTypeHeader) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers,
      credentials: "include",
      ...options,
    });

    if (!response.ok) {
      const fallbackMessage = `Request failed (${response.status} ${response.statusText})`;
      let message = fallbackMessage;
      const contentType = response.headers.get("content-type") || "";
      const rawBody = await response.text().catch(() => "");
      let parsed = null;

      if (contentType.includes("application/json") && rawBody) {
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          parsed = null;
        }
      }

      if (parsed && typeof parsed === "object") {
        message = parsed?.error || parsed?.message || fallbackMessage;
      } else if (rawBody) {
        message = rawBody;
      }

      const error = new Error(message);
      if (parsed && typeof parsed === "object") {
        Object.entries(parsed).forEach(([k, v]) => {
          if (k === "error" || k === "message") return;
          error[k] = v;
        });
      }
      error.status = response.status;
      error.endpoint = endpoint;
      throw error;
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  // Device Analysis templates
  async getDeviceAnalysisTemplates() {
    return this._requestWithLocalFallback("/device-analysis/templates");
  }

  async createDeviceAnalysisTemplate(template) {
    return this._requestWithLocalFallback("/device-analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id) {
    return this._requestWithLocalFallback(`/device-analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  // Device Analysis settings
  async getDeviceAnalysisSettings() {
    return this._requestWithLocalFallback("/device-analysis/settings");
  }

  async updateDeviceAnalysisSettings(updates) {
    return this._requestWithLocalFallback("/device-analysis/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  // Device Analysis persistence path (desktop app)
  async getDeviceAnalysisPersistencePath() {
    return this._requestWithLocalFallback("/device-analysis/persistence-path");
  }

  async updateDeviceAnalysisPersistencePath(pathValue) {
    return this._requestWithLocalFallback("/device-analysis/persistence-path", {
      method: "PATCH",
      body: JSON.stringify({ path: pathValue ?? "" }),
    });
  }

  async chooseDeviceAnalysisPersistencePath() {
    return this._requestWithLocalFallback("/device-analysis/persistence-path/choose", {
      method: "POST",
    });
  }

  _isDeviceAnalysisEndpoint(endpoint) {
    return (
      typeof endpoint === "string" &&
      (endpoint === "/device-analysis/templates" ||
        endpoint.startsWith("/device-analysis/templates/") ||
        endpoint === "/device-analysis/settings" ||
        endpoint === "/device-analysis/persistence-path" ||
        endpoint === "/device-analysis/persistence-path/choose")
    );
  }

  _canUseDesktopStoreForEndpoint(endpoint) {
    return this._isDeviceAnalysisEndpoint(endpoint) && Boolean(getDesktopStore());
  }

  _canUseLocalFallback(error, endpoint) {
    const canUseAnyFallback =
      this._canUseDesktopStoreForEndpoint(endpoint) || canUseStorage();
    if (!canUseAnyFallback) return false;

    const status = Number(error?.status);
    if (Number.isInteger(status)) {
      // Device Analysis endpoints should work without authentication; fall back to local storage/desktop store.
      if (status === 401 || status === 403) return true;
      if (status === 404 || status === 405) return true;
      if (status >= 500) return true;
      return false;
    }

    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("load failed")
    );
  }

  async _desktopStoreRequest(endpoint, options = {}) {
    const store = getDesktopStore();
    if (!store) {
      throw new Error("Desktop store bridge unavailable.");
    }

    const method = String(options.method || "GET").toUpperCase();

    if (endpoint === "/device-analysis/templates" && method === "GET") {
      return store.getDeviceAnalysisTemplates();
    }

    if (endpoint === "/device-analysis/templates" && method === "POST") {
      const payload = parseJsonBody(options.body) || {};
      return store.createDeviceAnalysisTemplate(payload);
    }

    if (endpoint.startsWith("/device-analysis/templates/") && method === "DELETE") {
      const id = endpoint.split("/")[3];
      return store.deleteDeviceAnalysisTemplate(id);
    }

    if (endpoint === "/device-analysis/settings" && method === "GET") {
      return store.getDeviceAnalysisSettings();
    }

    if (endpoint === "/device-analysis/settings" && method === "PATCH") {
      const updates = parseJsonBody(options.body) || {};
      return store.updateDeviceAnalysisSettings(updates);
    }

    if (endpoint === "/device-analysis/persistence-path" && method === "GET") {
      const info = await store.getDeviceAnalysisPersistencePath();
      return {
        ...(info || {}),
        isConfigurable: true,
      };
    }

    if (endpoint === "/device-analysis/persistence-path" && method === "PATCH") {
      const payload = parseJsonBody(options.body) || {};
      const info = await store.updateDeviceAnalysisPersistencePath(payload?.path ?? "");
      return {
        ...(info || {}),
        isConfigurable: true,
      };
    }

    if (endpoint === "/device-analysis/persistence-path/choose" && method === "POST") {
      const info = await store.chooseDeviceAnalysisPersistencePath();
      return {
        ...(info || {}),
        isConfigurable: true,
      };
    }

    throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
  }

  async _requestWithLocalFallback(endpoint, options = {}) {
    try {
      return await this.request(endpoint, options);
    } catch (error) {
      if (!this._canUseLocalFallback(error, endpoint)) throw error;

      if (this._canUseDesktopStoreForEndpoint(endpoint)) {
        if (!didWarnDesktopFallback) {
          didWarnDesktopFallback = true;
          console.warn(
            "[apiService] backend unavailable for Device Analysis settings/templates, using desktop store (userData JSON) fallback.",
          );
        }
        return this._desktopStoreRequest(endpoint, options);
      }

      if (canUseStorage()) {
        if (!didWarnLocalFallback) {
          didWarnLocalFallback = true;
          console.warn(
            "[apiService] backend unavailable for Device Analysis settings/templates, using local storage fallback.",
          );
        }
        return this._mockRequest(endpoint, options);
      }

      throw error;
    }
  }

  _mockRequest(endpoint, options = {}) {
    const method = options.method || "GET";

    if (endpoint === "/device-analysis/templates" && method === "GET") {
      return normalizeTemplates(MOCK_DATA.templates);
    }

    if (endpoint === "/device-analysis/templates" && method === "POST") {
      const payload = parseJsonBody(options.body) || {};
      const created = {
        id: payload.id || `tpl_${Date.now()}`,
        ...cloneTemplate(payload),
      };
      MOCK_DATA.templates.push(created);
      MOCK_DATA.templates = normalizeTemplates(MOCK_DATA.templates);
      persistMockData();
      return cloneTemplate(created);
    }

    if (endpoint.startsWith("/device-analysis/templates/") && method === "DELETE") {
      const id = endpoint.split("/")[3];
      MOCK_DATA.templates = MOCK_DATA.templates.filter((tpl) => tpl.id !== id);
      persistMockData();
      return { success: true };
    }

    if (endpoint === "/device-analysis/settings" && method === "GET") {
      MOCK_DATA.settings = normalizeSettings(MOCK_DATA.settings);
      return { ...MOCK_DATA.settings };
    }

    if (endpoint === "/device-analysis/settings" && method === "PATCH") {
      const updates = parseJsonBody(options.body) || {};
      MOCK_DATA.settings = normalizeSettings({ ...MOCK_DATA.settings, ...updates });
      persistMockData();
      return { ...MOCK_DATA.settings };
    }

    if (endpoint === "/device-analysis/persistence-path" && method === "GET") {
      return buildBrowserPersistenceInfo();
    }

    if (endpoint === "/device-analysis/persistence-path" && method === "PATCH") {
      return buildBrowserPersistenceInfo();
    }

    if (endpoint === "/device-analysis/persistence-path/choose" && method === "POST") {
      return { ...buildBrowserPersistenceInfo(), cancelled: true };
    }

    throw new Error(`Mock API endpoint not implemented: ${method} ${endpoint}`);
  }
}

export const apiService = new ApiService();
