import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";

const REQUIRED_STORE_METHODS = [
  "getTemplates",
  "createTemplate",
  "deleteTemplate",
  "getConductorSettings",
  "updateConductorSettings",
  "getPersistencePath",
  "updatePersistencePath",
  "choosePersistencePath",
] as const;

type StoreMethod = (typeof REQUIRED_STORE_METHODS)[number];

type JsonRecord = Record<string, unknown>;
type PersistencePathInfo = JsonRecord & { isConfigurable?: boolean };
export type DesktopStore = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

export const DESKTOP_STORE_UNAVAILABLE =
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

export const getDesktopStore = (): DesktopStore | null => {
  if (typeof window === "undefined") return null;

  const ipcRenderer = window.conductor?.ipcRenderer as DesktopStore | undefined;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") return null;

  return ipcRenderer;
};

export const getDesktopStoreMethod = (
  ipcRenderer: DesktopStore,
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
    case "getPersistencePath":
      return { name: workbenchIpcChannels.persistencePathGet };
    case "updatePersistencePath":
      return { name: workbenchIpcChannels.persistencePathSet, wrapPath: true };
    case "choosePersistencePath":
      return { name: workbenchIpcChannels.persistencePathChoose };
  }

  throw new Error(`${DESKTOP_STORE_UNAVAILABLE} (${method})`);
}

const normalizePersistencePathInfo = (info: unknown): PersistencePathInfo => ({
  ...(info || {}),
  isConfigurable: true,
});

export const requestDesktopStore = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const method = String(options.method || "GET").toUpperCase();
  const isStoreEndpoint = (name: string) => endpoint === `/${name}`;
  const isTemplateItemEndpoint =
    endpoint.startsWith("/templates/");

  const store = getDesktopStore();
  if (!store) {
    if (isStoreEndpoint("templates") && method === "GET") {
      return [];
    }

    if (isStoreEndpoint("settings") && method === "GET") {
      return {};
    }

    if (isStoreEndpoint("persistence-path") && method === "GET") {
      return { isConfigurable: false };
    }

    throw new Error(DESKTOP_STORE_UNAVAILABLE);
  }

  if (isStoreEndpoint("templates") && method === "GET") {
    return getDesktopStoreMethod(
      store,
      "getTemplates",
    )();
  }

  if (isStoreEndpoint("templates") && method === "POST") {
    return getDesktopStoreMethod(
      store,
      "createTemplate",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isTemplateItemEndpoint && method === "DELETE") {
    const id = endpoint.split("/")[2];
    return getDesktopStoreMethod(
      store,
      "deleteTemplate",
    )(id);
  }

  if (isStoreEndpoint("settings") && method === "GET") {
    return getDesktopStoreMethod(
      store,
      "getConductorSettings",
    )();
  }

  if (isStoreEndpoint("settings") && method === "PATCH") {
    return getDesktopStoreMethod(
      store,
      "updateConductorSettings",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isStoreEndpoint("persistence-path") && method === "GET") {
    const info = await getDesktopStoreMethod(
      store,
      "getPersistencePath",
    )();
    return normalizePersistencePathInfo(info);
  }

  if (isStoreEndpoint("persistence-path") && method === "PATCH") {
    const payload = parseJsonBody(options.body) || {};
    const path = typeof payload.path === "string" ? payload.path : "";
    const info = await getDesktopStoreMethod(
      store,
      "updatePersistencePath",
    )(path);
    return normalizePersistencePathInfo(info);
  }

  if (
    endpoint === "/persistence-path/choose" &&
    method === "POST"
  ) {
    const info = await getDesktopStoreMethod(
      store,
      "choosePersistencePath",
    )();
    return normalizePersistencePathInfo(info);
  }

  throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
};
