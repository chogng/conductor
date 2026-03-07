const DEFAULT_API_BASE_URL = "/api";
const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

const parseApiError = async (response, endpoint) => {
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
    Object.entries(parsed).forEach(([key, value]) => {
      if (key === "error" || key === "message") return;
      error[key] = value;
    });
  }

  error.status = response.status;
  error.endpoint = endpoint;
  return error;
};

export const requestApi = async (endpoint, options = {}) => {
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
    throw await parseApiError(response, endpoint);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
};
