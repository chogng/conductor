import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createConductorStoreMainService } from "../../../desktop-dist/src/cs/workbench/services/conductorStore/electron-main/conductorStoreMainService.js";

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

test("conductor store preserves settings defaults without eagerly writing config", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-"));
  const service = createConductorStoreMainService({ getHomeDir: () => homeDir });

  const settings = service.getConductorSettings();
  assert.equal(settings.theme, "system");
  assert.equal(fs.existsSync(path.join(homeDir, "config.json")), false);

  service.patchConductorSettings({ theme: "dark" });
  assert.equal(readJson(path.join(homeDir, "config.json")).theme, "dark");
});

test("conductor store creates templates in the default user data path", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-storage-"));
  const service = createConductorStoreMainService({ getHomeDir: () => homeDir });

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
  assert.equal(readJson(oldTemplatePath).templates[0].name, "Default");
});
