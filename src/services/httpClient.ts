const DEFAULT_API_BASE_URL = "/api";
const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

type ApiErrorPayload = Record<string, unknown> & {
  error?: string;
  message?: string;
};

export type ApiRequestError = Error & {
  status: number;
  endpoint: string;
  [key: string]: unknown;
};

const parseApiError = async (
  response: Response,
  endpoint: string,
): Promise<ApiRequestError> => {
  const fallbackMessage = `Request failed (${response.status} ${response.statusText})`;
  let message = fallbackMessage;
  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text().catch(() => "");
  let parsed: ApiErrorPayload | null = null;

  if (contentType.includes("application/json") && rawBody) {
    try {
      const candidate = JSON.parse(rawBody) as unknown;
      parsed = typeof candidate === "object" && candidate !== null ? (candidate as ApiErrorPayload) : null;
    } catch {
      parsed = null;
    }
  }

  if (parsed) {
    message = parsed.error || parsed.message || fallbackMessage;
  } else if (rawBody) {
    message = rawBody;
  }

  const error = new Error(message) as ApiRequestError;
  if (parsed) {
    Object.entries(parsed).forEach(([key, value]) => {
      if (key === "error" || key === "message") return;
      error[key] = value;
    });
  }

  error.status = response.status;
  error.endpoint = endpoint;
  return error;
};

export const requestApi = async <T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!isFormData && !headers.has("content-type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: options.credentials || "include",
  });

  if (!response.ok) {
    throw await parseApiError(response, endpoint);
  }

  if (response.status === 204) return null as T;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
};
