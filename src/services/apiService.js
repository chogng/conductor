// Production-like default: same-origin API (works with backend-served dist and with Vite proxy in dev)
const DEFAULT_API_BASE_URL = "/api";
const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

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
    return this._requestDeviceAnalysisStore("/device-analysis/templates");
  }

  async createDeviceAnalysisTemplate(template) {
    return this._requestDeviceAnalysisStore("/device-analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id) {
    return this._requestDeviceAnalysisStore(`/device-analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  // Device Analysis settings
  async getDeviceAnalysisSettings() {
    return this._requestDeviceAnalysisStore("/device-analysis/settings");
  }

  async updateDeviceAnalysisSettings(updates) {
    return this._requestDeviceAnalysisStore("/device-analysis/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  // Device Analysis persistence path (desktop app)
  async getDeviceAnalysisPersistencePath() {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path");
  }

  async updateDeviceAnalysisPersistencePath(pathValue) {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path", {
      method: "PATCH",
      body: JSON.stringify({ path: pathValue ?? "" }),
    });
  }

  async chooseDeviceAnalysisPersistencePath() {
    return this._requestDeviceAnalysisStore("/device-analysis/persistence-path/choose", {
      method: "POST",
    });
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

  async _requestDeviceAnalysisStore(endpoint, options = {}) {
    try {
      return await this._desktopStoreRequest(endpoint, options);
    } catch (error) {
      if (error?.message === "Desktop store bridge unavailable.") {
        throw new Error(
          "Desktop store bridge unavailable. Device Analysis data is persisted only via desktop config.json.",
        );
      }
      throw error;
    }
  }
}

export const apiService = new ApiService();
