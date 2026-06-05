import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAnalysisStorageMainService } from "../../../desktop-dist/src/cs/workbench/services/storage/electron-main/analysisStorageMainService.js";

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

test("analysis storage service preserves settings defaults without eagerly writing config", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-"));
  const service = createAnalysisStorageMainService({ getHomeDir: () => homeDir });

  const settings = service.getAnalysisSettings();
  assert.equal(settings.theme, "system");
  assert.equal(fs.existsSync(path.join(homeDir, "config.json")), false);

  service.patchAnalysisSettings({ theme: "dark" });
  assert.equal(readJson(path.join(homeDir, "config.json")).theme, "dark");
});

test("analysis storage service creates templates and migrates configured paths", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-"));
  const service = createAnalysisStorageMainService({ getHomeDir: () => homeDir });

  const saved = service.upsertAnalysisTemplate({
    name: "Default",
    selectedColumns: [1, "2", "x"],
  });
  assert.equal(saved.name, "Default");
  assert.deepEqual(service.getAnalysisTemplates().map((template) => template.name), [
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
