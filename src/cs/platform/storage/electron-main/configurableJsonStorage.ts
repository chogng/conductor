import path from "node:path";
import {
  jsonFileExists,
  migrateStorageFile,
  readJsonFile,
  writeJsonFile,
} from "./jsonFileStorage.js";

type StorageConfig = {
  customStorePath: string | null;
};

type StoragePathInfo = {
  currentPath: string;
  defaultPath: string;
  isCustom: boolean;
  isConfigurable: boolean;
};

type RelatedFile = {
  fileName: string;
  label: string;
};

type ConfigurableJsonStorageOptions = {
  getHomeDir: () => string;
  primaryFileName: string;
  configFileName: string;
};

const normalizeConfig = (raw: unknown): StorageConfig => {
  const next = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const customStorePath =
    typeof next.customStorePath === "string" && next.customStorePath.trim()
      ? next.customStorePath.trim()
      : null;

  return { customStorePath };
};

export function createConfigurableJsonStorage(options: ConfigurableJsonStorageOptions) {
  const getHomeDir = options.getHomeDir;
  const primaryFileName = options.primaryFileName;
  const configFileName = options.configFileName;

  let configCache: StorageConfig | null = null;

  const getDefaultPath = (): string => path.join(getHomeDir(), primaryFileName);

  const getConfigPath = (): string => path.join(getHomeDir(), configFileName);

  const readConfig = (): StorageConfig => {
    if (configCache) {
      return { ...configCache };
    }

    const parsed = readJsonFile<Record<string, unknown>>(getConfigPath());
    if (!parsed) {
      configCache = { customStorePath: null };
      return { ...configCache };
    }

    configCache = normalizeConfig(parsed);
    return { ...configCache };
  };

  const writeConfig = (nextConfig: StorageConfig): StorageConfig => {
    const normalized = normalizeConfig(nextConfig);
    writeJsonFile(getConfigPath(), normalized);
    configCache = normalized;
    return { ...normalized };
  };

  const getPersistenceInfo = (): StoragePathInfo => {
    const { customStorePath } = readConfig();
    const defaultPath = getDefaultPath();
    const currentPath = customStorePath || defaultPath;

    return {
      currentPath,
      defaultPath,
      isCustom: Boolean(customStorePath),
      isConfigurable: true,
    };
  };

  const getCurrentPath = (): string => getPersistenceInfo().currentPath;

  const getRelatedPath = (fileName: string): string =>
    path.join(path.dirname(getCurrentPath()), fileName);

  const getRelatedPathFromPrimary = (primaryPath: string, fileName: string): string =>
    path.join(path.dirname(primaryPath), fileName);

  const getRelatedPathWithPrimaryNameSuffix = (suffix: string): string => {
    const primaryPath = getCurrentPath();
    const parsed = path.parse(primaryPath);
    return path.join(parsed.dir, `${parsed.name}${suffix}`);
  };

  const setCustomPath = (
    nextPath: string | null,
    relatedFiles: RelatedFile[] = [],
    primaryLabel = "storage",
  ) => {
    const normalizedPath =
      typeof nextPath === "string" && nextPath.trim() ? nextPath.trim() : null;

    const previousPrimaryPath = getCurrentPath();
    const previousRelatedPaths = relatedFiles.map(({ fileName }) =>
      getRelatedPathFromPrimary(previousPrimaryPath, fileName),
    );

    if (normalizedPath) {
      if (!path.isAbsolute(normalizedPath)) {
        throw new Error("User config path must be an absolute file path.");
      }
      writeConfig({ customStorePath: normalizedPath });
    } else {
      writeConfig({ customStorePath: null });
    }

    const currentPrimaryPath = getCurrentPath();
    relatedFiles.forEach((relatedFile, index) => {
      const previousPath = previousRelatedPaths[index];
      const currentPath = getRelatedPathFromPrimary(currentPrimaryPath, relatedFile.fileName);
      migrateStorageFile(previousPath, currentPath, relatedFile.label);
    });
    migrateStorageFile(previousPrimaryPath, currentPrimaryPath, primaryLabel);

    return getPersistenceInfo();
  };

  return {
    getConfigPath,
    getCurrentPath,
    getDefaultPath,
    getPersistenceInfo,
    getRelatedPath,
    getRelatedPathFromPrimary,
    getRelatedPathWithPrimaryNameSuffix,
    jsonFileExists,
    readConfig,
    setCustomPath,
    writeConfig,
  };
}
