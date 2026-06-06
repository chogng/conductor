import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStorageMainService } from "../../../desktop-dist/src/cs/workbench/services/storage/electron-main/storageMainService.js";

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

test("analysis storage service preserves settings defaults without eagerly writing config", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-"));
  const service = createStorageMainService({ getHomeDir: () => homeDir });

  const settings = service.getConductorSettings();
  assert.equal(settings.theme, "system");
  assert.equal(fs.existsSync(path.join(homeDir, "config.json")), false);

  service.patchConductorSettings({ theme: "dark" });
  assert.equal(readJson(path.join(homeDir, "config.json")).theme, "dark");
});

test("analysis storage service creates templates and migrates configured paths", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-"));
  const service = createStorageMainService({ getHomeDir: () => homeDir });

  const saved = service.upsertTemplate({
    name: "Default",
    selectedColumns: [1, "2", "x"],
  });
  assert.equal(saved.name, "Default");
  assert.deepEqual(service.getTemplates().map((template) => template.name), [
    "Default",
  ]);

  const oldTemplatePath = path.join(homeDir, "template.json");
  assert.equal(fs.existsSync(oldTemplatePath), true);

  const customDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-custom-"));
  const customConfigPath = path.join(customDir, "config.json");
  const info = service.setPersistencePath(customConfigPath);
  assert.equal(info.currentPath, customConfigPath);
  assert.equal(fs.existsSync(path.join(customDir, "template.json")), true);
  assert.equal(readJson(path.join(customDir, "template.json")).templates[0].name, "Default");
});
