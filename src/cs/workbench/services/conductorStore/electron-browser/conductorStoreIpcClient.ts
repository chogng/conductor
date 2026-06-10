import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";

const REQUIRED_STORE_METHODS = [
  "getTemplates",
  "createTemplate",
  "deleteTemplate",
  "getConductorSettings",
  "updateConductorSettings",
] as const;

type StoreMethod = (typeof REQUIRED_STORE_METHODS)[number];

type JsonRecord = Record<string, unknown>;
export type ConductorStoreBridge = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

export const CONDUCTOR_STORE_UNAVAILABLE =
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

export const getConductorStoreBridge = (): ConductorStoreBridge | null => {
  if (typeof window === "undefined") return null;

  const ipcRenderer = window.conductor?.ipcRenderer as ConductorStoreBridge | undefined;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") return null;

  return ipcRenderer;
};

export const getConductorStoreMethod = (
  ipcRenderer: ConductorStoreBridge,
  method: StoreMethod,
): ((...args: unknown[]) => unknown) => {
  const channel = resolveStoreChannel(method);
  return (...args: unknown[]) => {
    if (channel.wrapPath) {
      return ipcRenderer.invoke(channel.name, { path: args[0] });
    }

    return ipcRenderer.invoke(channel.name, ...args);
  };
};

function resolveStoreChannel(
  method: StoreMethod,
): { name: string; wrapPath?: boolean } {
  switch (method) {
    case "getTemplates":
      return { name: workbenchIpcChannels.templatesGet };
    case "createTemplate":
      return { name: workbenchIpcChannels.templatesCreate };
    case "deleteTemplate":
      return { name: workbenchIpcChannels.templatesDelete };
    case "getConductorSettings":
      return { name: workbenchIpcChannels.settingsGet };
    case "updateConductorSettings":
      return { name: workbenchIpcChannels.settingsPatch };
  }

  throw new Error(`${CONDUCTOR_STORE_UNAVAILABLE} (${method})`);
}

export const requestConductorStore = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const method = String(options.method || "GET").toUpperCase();
  const isStoreEndpoint = (name: string) => endpoint === `/${name}`;
  const isTemplateItemEndpoint =
    endpoint.startsWith("/templates/");

  const store = getConductorStoreBridge();
  if (!store) {
    if (isStoreEndpoint("templates") && method === "GET") {
      return [];
    }

    if (isStoreEndpoint("settings") && method === "GET") {
      return {};
    }

    throw new Error(CONDUCTOR_STORE_UNAVAILABLE);
  }

  if (isStoreEndpoint("templates") && method === "GET") {
    return getConductorStoreMethod(
      store,
      "getTemplates",
    )();
  }

  if (isStoreEndpoint("templates") && method === "POST") {
    return getConductorStoreMethod(
      store,
      "createTemplate",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isTemplateItemEndpoint && method === "DELETE") {
    const id = endpoint.split("/")[2];
    return getConductorStoreMethod(
      store,
      "deleteTemplate",
    )(id);
  }

  if (isStoreEndpoint("settings") && method === "GET") {
    return getConductorStoreMethod(
      store,
      "getConductorSettings",
    )();
  }

  if (isStoreEndpoint("settings") && method === "PATCH") {
    return getConductorStoreMethod(
      store,
      "updateConductorSettings",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
};
