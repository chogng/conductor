// @ts-nocheck
import type {
  AnalysisStoreOptions,
  IAnalysisStorageService,
} from "../common/storage.js";
import { createConfigurableJsonStorage } from "../../../../platform/storage/electron-main/configurableJsonStorage.js";
import { createJsonStorageDocument } from "../../../../platform/storage/electron-main/jsonStorageDocument.js";
import {
  jsonFileExists,
  readJsonFile,
  removeJsonFileIfExists,
  writeJsonFile,
} from "../../../../platform/storage/electron-main/jsonFileStorage.js";

import {
  ANALYSIS_LEGACY_SETTINGS_FILENAME_SUFFIX,
  ANALYSIS_SETTINGS_FILENAME,
  ANALYSIS_STORE_CONFIG_FILENAME,
  ANALYSIS_TEMPLATE_FILENAME,
  ANALYSIS_DEFAULT_SETTINGS,
  applyStartupAnalysisDefaults,
  buildDefaultStoreData,
  cloneAnalysisSettings,
  normalizeAnalysisSettings,
  normalizeAnalysisTemplate,
  normalizeAnalysisTemplates,
  normalizeStoreData,
  toTemplateNameKey,
} from "../common/schema.js";
export function createAnalysisStorageMainService(
  options: AnalysisStoreOptions,
): IAnalysisStorageService {
  const input = options && typeof options === "object" ? options : {};
  const getHomeDir =
    typeof input.getHomeDir === "function" ? input.getHomeDir : null;

  if (!getHomeDir) {
    throw new Error("Device analysis store requires getHomeDir().");
  }

  const storage = createConfigurableJsonStorage({
    getHomeDir,
    primaryFileName: ANALYSIS_SETTINGS_FILENAME,
    configFileName: ANALYSIS_STORE_CONFIG_FILENAME,
  });

  function cloneStoreData(store) {
    return normalizeStoreData(store);
  }
  const templateDocument = createJsonStorageDocument({
    getPath: getTemplatePath,
    getDefaultValue: buildDefaultStoreData,
    readNormalize: normalizeStoreData,
    clone: cloneStoreData,
  });

  const settingsDocument = createJsonStorageDocument({
    getPath: getStorePath,
    getDefaultValue: () => normalizeAnalysisSettings(ANALYSIS_DEFAULT_SETTINGS),
    readNormalize: applyStartupAnalysisDefaults,
    writeNormalize: normalizeAnalysisSettings,
    clone: cloneAnalysisSettings,
  });

  function clearStoreCache() {
    templateDocument.clear();
  }

  function clearSettingsCache() {
    settingsDocument.clear();
  }

  function getStorePersistenceInfo() {
    return storage.getPersistenceInfo();
  }

  function getStorePath() {
    return storage.getCurrentPath();
  }

  function getTemplatePath() {
    return storage.getRelatedPath(ANALYSIS_TEMPLATE_FILENAME);
  }

  function getLegacySettingsPath() {
    return storage.getRelatedPathWithPrimaryNameSuffix(
      ANALYSIS_LEGACY_SETTINGS_FILENAME_SUFFIX,
    );
  }

  function extractLegacySettings(raw) {
    if (!raw || typeof raw !== "object") return null;

    const next = { ...raw };
    delete next.templates;
    return next;
  }

  function ensureCurrentPersistenceLayout() {
    const settingsPath = getStorePath();
    const templatePath = getTemplatePath();
    const legacySettingsPath = getLegacySettingsPath();
    const currentSettingsRaw = readJsonFile<Record<string, unknown>>(settingsPath);
    const legacySettingsRaw = readJsonFile<Record<string, unknown>>(legacySettingsPath);
    const currentSettingsHasTemplates = Array.isArray(currentSettingsRaw?.templates);
    const templateExists = jsonFileExists(templatePath);

    if (!templateExists && currentSettingsHasTemplates) {
      writeJsonFile(
        templatePath,
        normalizeStoreData({ templates: currentSettingsRaw.templates }),
      );
      clearStoreCache();
    }

    if (legacySettingsRaw) {
      writeJsonFile(settingsPath, normalizeAnalysisSettings(legacySettingsRaw));
      removeJsonFileIfExists(legacySettingsPath);
      clearSettingsCache();
    } else if (currentSettingsHasTemplates) {
      writeJsonFile(
        settingsPath,
        normalizeAnalysisSettings(extractLegacySettings(currentSettingsRaw)),
      );
      clearSettingsCache();
    } else if (currentSettingsRaw && typeof currentSettingsRaw === "object") {
      const normalizedCurrentSettings = normalizeAnalysisSettings(
        currentSettingsRaw,
      );
      const rawSerialized = JSON.stringify(currentSettingsRaw);
      const normalizedSerialized = JSON.stringify(normalizedCurrentSettings);
      if (rawSerialized !== normalizedSerialized) {
        writeJsonFile(settingsPath, normalizedCurrentSettings);
        clearSettingsCache();
      }
    }
  }

  function readStore() {
    ensureCurrentPersistenceLayout();
    return templateDocument.readOrCreateDefault();
  }

  function writeStore(nextStore) {
    ensureCurrentPersistenceLayout();
    return templateDocument.write(nextStore);
  }

  function tryReadSettingsFile() {
    ensureCurrentPersistenceLayout();
    return settingsDocument.tryRead();
  }

  function writeSettings(nextSettings) {
    ensureCurrentPersistenceLayout();
    return settingsDocument.write(nextSettings);
  }

  function getAnalysisSettings() {
    const direct = tryReadSettingsFile();
    if (direct) return direct;
    return settingsDocument.readDefault();
  }

  function patchAnalysisSettings(updates) {
    const patch = updates && typeof updates === "object" ? updates : {};
    const nextSettings = normalizeAnalysisSettings({
      ...getAnalysisSettings(),
      ...patch,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  function getAnalysisTemplates() {
    return readStore().templates;
  }

  function upsertAnalysisTemplate(payload) {
    const input = normalizeAnalysisTemplate(payload);
    if (!input) throw new Error("Invalid template payload.");

    const inputNameKey = toTemplateNameKey(input.name);
    if (!inputNameKey) throw new Error("Template name is required.");

    const store = readStore();
    const existingTemplates = Array.isArray(store.templates) ? store.templates : [];
    let existingMatch = null;
    for (let i = existingTemplates.length - 1; i >= 0; i -= 1) {
      const tpl = existingTemplates[i];
      if (toTemplateNameKey(tpl?.name) === inputNameKey) {
        existingMatch = tpl;
        break;
      }
    }

    const saved = {
      ...existingMatch,
      ...input,
      id: existingMatch?.id || input.id || `tpl_${Date.now()}`,
    };
    const savedId = String(saved.id || "");
    store.templates = normalizeAnalysisTemplates([
      saved,
      ...existingTemplates.filter((tpl) => {
        const nameKey = toTemplateNameKey(tpl?.name);
        const tplId = String(tpl?.id || "");
        return nameKey !== inputNameKey && tplId !== savedId;
      }),
    ]);
    writeStore(store);
    return saved;
  }

  function deleteAnalysisTemplate(id) {
    const templateId = String(id || "").trim();
    if (!templateId) throw new Error("Invalid template id.");

    const store = readStore();
    store.templates = store.templates.filter((tpl) => String(tpl?.id || "") !== templateId);
    writeStore(store);
    return { success: true };
  }

  function setPersistencePath(nextPath) {
    ensureCurrentPersistenceLayout();

    const info = storage.setCustomPath(
      typeof nextPath === "string" ? nextPath : null,
      [{ fileName: ANALYSIS_TEMPLATE_FILENAME, label: "device-analysis-template" }],
      "device-analysis-settings",
    );
    clearStoreCache();
    clearSettingsCache();
    return info;
  }

  return {
    getHomeDir,
    getStorePersistenceInfo,
    getAnalysisSettings,
    patchAnalysisSettings,
    getAnalysisTemplates,
    upsertAnalysisTemplate,
    deleteAnalysisTemplate,
    setPersistencePath,
  };
}
