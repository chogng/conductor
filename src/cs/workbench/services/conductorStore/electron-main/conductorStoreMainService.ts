// @ts-nocheck
import path from "node:path";
import type {
  ConductorStoreOptions,
  IConductorStoreService,
} from "../common/conductorStore.js";
import { createJsonStorageDocument } from "../../../../platform/storage/electron-main/jsonStorageDocument.js";

import {
  SETTINGS_FILENAME,
  TEMPLATE_FILENAME,
  DEFAULT_SETTINGS,
  applyStartupConductorDefaults,
  buildDefaultStoreData,
  cloneConductorSettings,
  normalizeConductorSettings,
  normalizeStoredTemplate,
  normalizeStoredTemplates,
  normalizeStoreData,
  toTemplateNameKey,
} from "../common/conductorStoreSchema.js";
export function createConductorStoreMainService(
  options: ConductorStoreOptions,
): IConductorStoreService {
  const input = options && typeof options === "object" ? options : {};
  const getHomeDir =
    typeof input.getHomeDir === "function" ? input.getHomeDir : null;

  if (!getHomeDir) {
    throw new Error("Store requires getHomeDir().");
  }

  const getStoragePath = (fileName) => path.join(getHomeDir(), fileName);

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
    getDefaultValue: () => normalizeConductorSettings(DEFAULT_SETTINGS),
    readNormalize: applyStartupConductorDefaults,
    writeNormalize: normalizeConductorSettings,
    clone: cloneConductorSettings,
  });

  function clearStoreCache() {
    templateDocument.clear();
  }

  function clearSettingsCache() {
    settingsDocument.clear();
  }

  function getStorePath() {
    return getStoragePath(SETTINGS_FILENAME);
  }

  function getTemplatePath() {
    return getStoragePath(TEMPLATE_FILENAME);
  }

  function readStore() {
    return templateDocument.readOrCreateDefault();
  }

  function writeStore(nextStore) {
    return templateDocument.write(nextStore);
  }

  function tryReadSettingsFile() {
    return settingsDocument.tryRead();
  }

  function writeSettings(nextSettings) {
    return settingsDocument.write(nextSettings);
  }

  function getConductorSettings() {
    const direct = tryReadSettingsFile();
    if (direct) return direct;
    return settingsDocument.readDefault();
  }

  function patchConductorSettings(updates) {
    const patch = updates && typeof updates === "object" ? updates : {};
    const nextSettings = normalizeConductorSettings({
      ...getConductorSettings(),
      ...patch,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  function getTemplates() {
    return readStore().templates;
  }

  function upsertTemplate(payload) {
    const input = normalizeStoredTemplate(payload);
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
    store.templates = normalizeStoredTemplates([
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

  function deleteTemplate(id) {
    const templateId = String(id || "").trim();
    if (!templateId) throw new Error("Invalid template id.");

    const store = readStore();
    store.templates = store.templates.filter((tpl) => String(tpl?.id || "") !== templateId);
    writeStore(store);
    return { success: true };
  }

  return {
    getHomeDir,
    getConductorSettings,
    patchConductorSettings,
    getTemplates,
    upsertTemplate,
    deleteTemplate,
  };
}
