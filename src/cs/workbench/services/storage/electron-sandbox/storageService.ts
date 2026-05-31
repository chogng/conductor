import { desktopIpcChannels } from "src/cs/workbench/services/desktop/common/desktopIpcChannels";

const REQUIRED_ANALYSIS_STORE_METHODS = [
  "getAnalysisTemplates",
  "createAnalysisTemplate",
  "deleteAnalysisTemplate",
  "getAnalysisSettings",
  "updateAnalysisSettings",
  "getAnalysisPersistencePath",
  "updateAnalysisPersistencePath",
  "chooseAnalysisPersistencePath",
] as const;

const LEGACY_ANALYSIS_STORE_METHODS = [
  "getDeviceAnalysisTemplates",
  "createDeviceAnalysisTemplate",
  "deleteDeviceAnalysisTemplate",
  "getSettings",
  "updateSettings",
  "getDeviceAnalysisPersistencePath",
  "updateDeviceAnalysisPersistencePath",
  "chooseDeviceAnalysisPersistencePath",
] as const;

type AnalysisStoreMethod = (typeof REQUIRED_ANALYSIS_STORE_METHODS)[number];
type LegacyAnalysisStoreMethod =
  (typeof LEGACY_ANALYSIS_STORE_METHODS)[number];

type JsonRecord = Record<string, unknown>;
type PersistencePathInfo = JsonRecord & { isConfigurable?: boolean };
export type AnalysisDesktopStore = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};
export type DesktopStore = AnalysisDesktopStore;

declare global {
  interface Window {
    conductor?: {
      ipcRenderer?: unknown;
      webUtils?: unknown;
    };
  }
}

export const DESKTOP_STORE_UNAVAILABLE =
  "Desktop store bridge unavailable.";
export const DEVICE_ANALYSIS_DESKTOP_STORE_UNAVAILABLE =
  DESKTOP_STORE_UNAVAILABLE;

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
  legacyMethod?: LegacyAnalysisStoreMethod,
): ((...args: unknown[]) => unknown) => {
  const channel = resolveStoreChannel(method, legacyMethod);
  return (...args: unknown[]) => {
    if (channel.wrapPath) {
      return ipcRenderer.invoke(channel.name, { path: args[0] });
    }

    return ipcRenderer.invoke(channel.name, ...args);
  };
};

function resolveStoreChannel(
  method: AnalysisStoreMethod,
  legacyMethod?: LegacyAnalysisStoreMethod,
): { name: string; wrapPath?: boolean } {
  switch (method) {
    case "getAnalysisTemplates":
      return { name: desktopIpcChannels.templatesGet };
    case "createAnalysisTemplate":
      return { name: desktopIpcChannels.templatesCreate };
    case "deleteAnalysisTemplate":
      return { name: desktopIpcChannels.templatesDelete };
    case "getAnalysisSettings":
      return { name: desktopIpcChannels.settingsGet };
    case "updateAnalysisSettings":
      return { name: desktopIpcChannels.settingsPatch };
    case "getAnalysisPersistencePath":
      return { name: desktopIpcChannels.persistencePathGet };
    case "updateAnalysisPersistencePath":
      return { name: desktopIpcChannels.persistencePathSet, wrapPath: true };
    case "chooseAnalysisPersistencePath":
      return { name: desktopIpcChannels.persistencePathChoose };
  }

  throw new Error(
    legacyMethod
      ? `${DESKTOP_STORE_UNAVAILABLE} (${method}/${legacyMethod})`
      : `${DESKTOP_STORE_UNAVAILABLE} (${method})`,
  );
}

const normalizePersistencePathInfo = (info: unknown): PersistencePathInfo => ({
  ...(info || {}),
  isConfigurable: true,
});

export const requestAnalysisDesktopStore = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const store = getDesktopStore();
  if (!store) {
    throw new Error(DESKTOP_STORE_UNAVAILABLE);
  }

  const method = String(options.method || "GET").toUpperCase();
  const isAnalysisEndpoint = (name: string) =>
    endpoint === `/analysis/${name}`;
  const isAnalysisTemplateItemEndpoint =
    endpoint.startsWith("/analysis/templates/");

  if (isAnalysisEndpoint("templates") && method === "GET") {
    return getDesktopStoreMethod(
      store,
      "getAnalysisTemplates",
      "getDeviceAnalysisTemplates",
    )();
  }

  if (isAnalysisEndpoint("templates") && method === "POST") {
    return getDesktopStoreMethod(
      store,
      "createAnalysisTemplate",
      "createDeviceAnalysisTemplate",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isAnalysisTemplateItemEndpoint && method === "DELETE") {
    const id = endpoint.split("/")[3];
    return getDesktopStoreMethod(
      store,
      "deleteAnalysisTemplate",
      "deleteDeviceAnalysisTemplate",
    )(id);
  }

  if (isAnalysisEndpoint("settings") && method === "GET") {
    return getDesktopStoreMethod(
      store,
      "getAnalysisSettings",
      "getSettings",
    )();
  }

  if (isAnalysisEndpoint("settings") && method === "PATCH") {
    return getDesktopStoreMethod(
      store,
      "updateAnalysisSettings",
      "updateSettings",
    )(
      parseJsonBody(options.body) || {},
    );
  }

  if (isAnalysisEndpoint("persistence-path") && method === "GET") {
    const info = await getDesktopStoreMethod(
      store,
      "getAnalysisPersistencePath",
      "getDeviceAnalysisPersistencePath",
    )();
    return normalizePersistencePathInfo(info);
  }

  if (isAnalysisEndpoint("persistence-path") && method === "PATCH") {
    const payload = parseJsonBody(options.body) || {};
    const path = typeof payload.path === "string" ? payload.path : "";
    const info = await getDesktopStoreMethod(
      store,
      "updateAnalysisPersistencePath",
      "updateDeviceAnalysisPersistencePath",
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
      "chooseDeviceAnalysisPersistencePath",
    )();
    return normalizePersistencePathInfo(info);
  }

  throw new Error(`Desktop store endpoint not implemented: ${method} ${endpoint}`);
};

export const requestDesktopStore = requestAnalysisDesktopStore;
