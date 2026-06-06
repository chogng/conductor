import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";

const REQUIRED_STORE_METHODS = [
  "getAnalysisTemplates",
  "createAnalysisTemplate",
  "deleteAnalysisTemplate",
  "getAnalysisSettings",
  "updateAnalysisSettings",
  "getAnalysisPersistencePath",
  "updateAnalysisPersistencePath",
  "chooseAnalysisPersistencePath",
] as const;

type AnalysisStoreMethod = (typeof REQUIRED_STORE_METHODS)[number];

type JsonRecord = Record<string, unknown>;
type PersistencePathInfo = JsonRecord & { isConfigurable?: boolean };
export type AnalysisDesktopStore = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};
export type DesktopStore = AnalysisDesktopStore;

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

export const getDesktopStore = (): AnalysisDesktopStore | null => {
  if (typeof window === "undefined") return null;

  const ipcRenderer = window.conductor?.ipcRenderer as AnalysisDesktopStore | undefined;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") return null;

  return ipcRenderer;
};

export const getDesktopStoreMethod = (
  ipcRenderer: AnalysisDesktopStore,
  method: AnalysisStoreMethod,
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
  method: AnalysisStoreMethod,
): { name: string; wrapPath?: boolean } {
  switch (method) {
    case "getAnalysisTemplates":
      return { name: workbenchIpcChannels.templatesGet };
    case "createAnalysisTemplate":
      return { name: workbenchIpcChannels.templatesCreate };
    case "deleteAnalysisTemplate":
      return { name: workbenchIpcChannels.templatesDelete };
    case "getAnalysisSettings":
      return { name: workbenchIpcChannels.settingsGet };
    case "updateAnalysisSettings":
      return { name: workbenchIpcChannels.settingsPatch };
    case "getAnalysisPersistencePath":
      return { name: workbenchIpcChannels.persistencePathGet };
    case "updateAnalysisPersistencePath":
      return { name: workbenchIpcChannels.persistencePathSet, wrapPath: true };
    case "chooseAnalysisPersistencePath":
      return { name: workbenchIpcChannels.persistencePathChoose };
  }

  throw new Error(`${DESKTOP_STORE_UNAVAILABLE} (${method})`);
}

const normalizePersistencePathInfo = (info: unknown): PersistencePathInfo => ({
  ...(info || {}),
  isConfigurable: true,
});

export const requestAnalysisDesktopStore = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const method = String(options.method || "GET").toUpperCase();
  const isAnalysisEndpoint = (name: string) =>
    endpoint === `/analysis/${name}`;
  const isAnalysisTemplateItemEndpoint =
    endpoint.startsWith("/analysis/templates/");

  const store = getDesktopStore();
  if (!store) {
    if (isAnalysisEndpoint("templates") && method === "GET") {
      return [];
    }

    if (isAnalysisEndpoint("settings") && method === "GET") {
      return {};
    }

    if (isAnalysisEndpoint("persistence-path") && method === "GET") {
      return { isConfigurable: false };
    }

    throw new Error(DESKTOP_STORE_UNAVAILABLE);
  }

  if (isAnalysisEndpoint("templates") && method === "GET") {
    return getDesktopStoreMethod(
      store,
      "getAnalysisTemplates",
    )();
  }

  if (isAnalysisEndpoint("templates") && method === "POST") {
    return getDesktopStoreMethod(
      store,
      "createAnalysisTemplate",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isAnalysisTemplateItemEndpoint && method === "DELETE") {
    const id = endpoint.split("/")[3];
    return getDesktopStoreMethod(
      store,
      "deleteAnalysisTemplate",
    )(id);
  }

  if (isAnalysisEndpoint("settings") && method === "GET") {
    return getDesktopStoreMethod(
      store,
      "getAnalysisSettings",
    )();
  }

  if (isAnalysisEndpoint("settings") && method === "PATCH") {
    return getDesktopStoreMethod(
      store,
      "updateAnalysisSettings",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isAnalysisEndpoint("persistence-path") && method === "GET") {
    const info = await getDesktopStoreMethod(
      store,
      "getAnalysisPersistencePath",
    )();
    return normalizePersistencePathInfo(info);
  }

  if (isAnalysisEndpoint("persistence-path") && method === "PATCH") {
    const payload = parseJsonBody(options.body) || {};
    const path = typeof payload.path === "string" ? payload.path : "";
    const info = await getDesktopStoreMethod(
      store,
      "updateAnalysisPersistencePath",
    )(path);
    return normalizePersistencePathInfo(info);
  }

  if (
    endpoint === "/analysis/persistence-path/choose" &&
    method === "POST"
  ) {
    const info = await getDesktopStoreMethod(
      store,
      "chooseAnalysisPersistencePath",
    )();
    return normalizePersistencePathInfo(info);
  }

  throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
};

export const requestDesktopStore = requestAnalysisDesktopStore;
