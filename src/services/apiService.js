import { getMockUser } from "../utils/mockAuthStore";

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

const MOCK_DATA = {
  users: [
    {
      id: "user_mock_admin",
      username: "admin",
      name: "Admin",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
    {
      id: "user_mock_user",
      username: "user",
      name: "User",
      email: "user@example.com",
      role: "USER",
      status: "ACTIVE",
    },
  ],
  templates: [],
  settings: {
    defaultTemplate: null,
    lastTemplateId: null,
    ssMethod: "auto",
    ssDiagnosticsEnabled: true,
    ssShowFitLine: true,
    ssIdWindowLow: "1e-11",
    ssIdWindowHigh: "1e-9",
  },
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
  unauthorizedCallback = null;

  bindUnauthorizedCallback(callback) {
    this.unauthorizedCallback = callback;
  }

  async request(endpoint, options = {}) {
    if (DEV_MOCK_API) {
      if (!didWarnMockApi) {
        didWarnMockApi = true;
        console.warn(
          "[apiService] VITE_MOCK_API=true: using mock API (backend will not be called).",
        );
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
      if (response.status === 401 && this.unauthorizedCallback) {
        this.unauthorizedCallback();
      }

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

  // Auth / user profile
  async login(username, password) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  async createUser(userData) {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id, updates) {
    return this.request(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  // Device Analysis templates
  async getDeviceAnalysisTemplates() {
    return this.request("/device-analysis/templates");
  }

  async createDeviceAnalysisTemplate(template) {
    return this.request("/device-analysis/templates", {
      method: "POST",
      body: JSON.stringify(template),
    });
  }

  async deleteDeviceAnalysisTemplate(id) {
    return this.request(`/device-analysis/templates/${id}`, {
      method: "DELETE",
    });
  }

  // Device Analysis settings
  async getDeviceAnalysisSettings() {
    return this.request("/device-analysis/settings");
  }

  async updateDeviceAnalysisSettings(updates) {
    return this.request("/device-analysis/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  _mockRequest(endpoint, options = {}) {
    const method = options.method || "GET";

    if (endpoint === "/auth/me") {
      const saved = getMockUser();
      if (saved) return saved;
      throw new Error("Not authenticated");
    }

    if (endpoint === "/auth/login" && method === "POST") {
      const payload = parseJsonBody(options.body) || {};
      const username = String(payload.username || "").toLowerCase();
      return (
        MOCK_DATA.users.find((u) => String(u.username).toLowerCase() === username) ||
        MOCK_DATA.users[0]
      );
    }

    if (endpoint === "/auth/logout") return { success: true };

    if (endpoint === "/users" && method === "POST") {
      const payload = parseJsonBody(options.body) || {};
      const created = {
        id: `user_${Date.now()}`,
        username: payload.username || `user_${MOCK_DATA.users.length + 1}`,
        name: payload.name || payload.username || "User",
        email: payload.email || "",
        role: payload.role || "USER",
        status: payload.status || "ACTIVE",
      };
      MOCK_DATA.users.push(created);
      return created;
    }

    if (endpoint.startsWith("/users/") && method === "PATCH") {
      const id = endpoint.split("/")[2];
      const updates = parseJsonBody(options.body) || {};
      const index = MOCK_DATA.users.findIndex((u) => u.id === id);
      if (index === -1) {
        const created = { id, ...updates };
        MOCK_DATA.users.push(created);
        return created;
      }
      const next = { ...MOCK_DATA.users[index], ...updates };
      MOCK_DATA.users[index] = next;
      return next;
    }

    if (endpoint === "/device-analysis/templates" && method === "GET") {
      return [...MOCK_DATA.templates];
    }

    if (endpoint === "/device-analysis/templates" && method === "POST") {
      const payload = parseJsonBody(options.body) || {};
      const created = {
        id: payload.id || `tpl_${Date.now()}`,
        ...payload,
      };
      MOCK_DATA.templates.push(created);
      return created;
    }

    if (endpoint.startsWith("/device-analysis/templates/") && method === "DELETE") {
      const id = endpoint.split("/")[3];
      MOCK_DATA.templates = MOCK_DATA.templates.filter((tpl) => tpl.id !== id);
      return { success: true };
    }

    if (endpoint === "/device-analysis/settings" && method === "GET") {
      return { ...MOCK_DATA.settings };
    }

    if (endpoint === "/device-analysis/settings" && method === "PATCH") {
      const updates = parseJsonBody(options.body) || {};
      MOCK_DATA.settings = {
        ...MOCK_DATA.settings,
        ...updates,
      };
      return { ...MOCK_DATA.settings };
    }

    throw new Error(`Mock API endpoint not implemented: ${method} ${endpoint}`);
  }
}

export const apiService = new ApiService();
