import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { deleteLegacyConductorStoreFiles } from "src/cs/workbench/services/conductorStore/electron-main/conductorStoreCleanup";

suite("workbench/services/conductorStore/node/conductorStoreCleanup", () => {
  function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-cleanup-"));
  }

	test("deletes only known legacy user storage files", () => {
		const root = createTempDir();
		try {
      const legacyHomeDir = path.join(root, ".device");
      fs.mkdirSync(legacyHomeDir, { recursive: true });
      fs.writeFileSync(path.join(legacyHomeDir, "config.json"), "{\"theme\":\"dark\"}", "utf8");
      fs.writeFileSync(path.join(legacyHomeDir, "template.json"), "{\"templates\":[]}", "utf8");
      fs.writeFileSync(path.join(legacyHomeDir, "store-path.json"), "{\"customStorePath\":null}", "utf8");
      fs.writeFileSync(path.join(legacyHomeDir, "keep.json"), "{}", "utf8");

      const deleted = deleteLegacyConductorStoreFiles(legacyHomeDir).map(filePath => path.basename(filePath)).sort();

      assert.deepEqual(deleted, ["config.json", "store-path.json", "template.json"]);
      assert.equal(fs.existsSync(path.join(legacyHomeDir, "config.json")), false);
      assert.equal(fs.existsSync(path.join(legacyHomeDir, "template.json")), false);
      assert.equal(fs.existsSync(path.join(legacyHomeDir, "store-path.json")), false);
      assert.equal(fs.existsSync(path.join(legacyHomeDir, "keep.json")), true);
    } finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});

	test("skips non-file legacy user storage paths", () => {
		const root = createTempDir();
		try {
			const legacyHomeDir = path.join(root, ".device");
			fs.mkdirSync(path.join(legacyHomeDir, "template.json"), { recursive: true });

			const deleted = deleteLegacyConductorStoreFiles(legacyHomeDir);

			assert.deepEqual(deleted, []);
			assert.equal(fs.statSync(path.join(legacyHomeDir, "template.json")).isDirectory(), true);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});
});
