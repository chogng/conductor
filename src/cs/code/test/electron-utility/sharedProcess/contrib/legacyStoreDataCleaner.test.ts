/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	deleteLegacyStoreDataFiles,
	migrateCustomStoreDataToDefault,
} from "src/cs/code/electron-utility/sharedProcess/contrib/legacyStoreDataCleaner";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("code/electron-utility/sharedProcess/contrib/legacyStoreDataCleaner", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	function createTempDir(): string {
		return fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-cleanup-"));
	}

	test("deletes only known legacy store files", () => {
		const root = createTempDir();
		try {
			const legacyHomeDir = path.join(root, ".device");
			fs.mkdirSync(legacyHomeDir, { recursive: true });
			fs.writeFileSync(path.join(legacyHomeDir, "config.json"), "{\"theme\":\"dark\"}", "utf8");
			fs.writeFileSync(path.join(legacyHomeDir, "template.json"), "{\"templates\":[]}", "utf8");
			fs.writeFileSync(path.join(legacyHomeDir, "store-path.json"), "{\"customStorePath\":null}", "utf8");
			fs.writeFileSync(path.join(legacyHomeDir, "keep.json"), "{}", "utf8");

			const deleted = deleteLegacyStoreDataFiles(legacyHomeDir).map(filePath => path.basename(filePath)).sort();

			assert.deepEqual(deleted, ["config.json", "store-path.json", "template.json"]);
			assert.equal(fs.existsSync(path.join(legacyHomeDir, "config.json")), false);
			assert.equal(fs.existsSync(path.join(legacyHomeDir, "template.json")), false);
			assert.equal(fs.existsSync(path.join(legacyHomeDir, "store-path.json")), false);
			assert.equal(fs.existsSync(path.join(legacyHomeDir, "keep.json")), true);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});

	test("skips non-file legacy store paths", () => {
		const root = createTempDir();
		try {
			const legacyHomeDir = path.join(root, ".device");
			fs.mkdirSync(path.join(legacyHomeDir, "template.json"), { recursive: true });

			const deleted = deleteLegacyStoreDataFiles(legacyHomeDir);

			assert.deepEqual(deleted, []);
			assert.equal(fs.statSync(path.join(legacyHomeDir, "template.json")).isDirectory(), true);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});

	test("migrates custom store files back to the default user data path", () => {
		const root = createTempDir();
		try {
			const userDataHomeDir = path.join(root, "User");
			const customDir = path.join(root, "custom");
			fs.mkdirSync(userDataHomeDir, { recursive: true });
			fs.mkdirSync(customDir, { recursive: true });
			fs.writeFileSync(path.join(userDataHomeDir, "store-path.json"), JSON.stringify({
				customStorePath: path.join(customDir, "config.json"),
			}), "utf8");
			fs.writeFileSync(path.join(customDir, "config.json"), "{\"theme\":\"dark\"}", "utf8");
			fs.writeFileSync(path.join(customDir, "template.json"), "{\"templates\":[]}", "utf8");

			const migrated = migrateCustomStoreDataToDefault(userDataHomeDir)
				.map(filePath => path.basename(filePath))
				.sort();

			assert.deepEqual(migrated, ["config.json", "template.json"]);
			assert.equal(fs.existsSync(path.join(userDataHomeDir, "config.json")), true);
			assert.equal(fs.existsSync(path.join(userDataHomeDir, "template.json")), true);
			assert.equal(fs.existsSync(path.join(userDataHomeDir, "store-path.json")), false);
			assert.equal(fs.existsSync(path.join(customDir, "config.json")), false);
			assert.equal(fs.existsSync(path.join(customDir, "template.json")), false);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});

	test("removes store path config when no custom store path is active", () => {
		const root = createTempDir();
		try {
			const userDataHomeDir = path.join(root, "User");
			fs.mkdirSync(userDataHomeDir, { recursive: true });
			fs.writeFileSync(path.join(userDataHomeDir, "config.json"), "{\"theme\":\"dark\"}", "utf8");
			fs.writeFileSync(path.join(userDataHomeDir, "template.json"), "{\"templates\":[]}", "utf8");
			fs.writeFileSync(path.join(userDataHomeDir, "store-path.json"), JSON.stringify({
				customStorePath: null,
			}), "utf8");

			const migrated = migrateCustomStoreDataToDefault(userDataHomeDir);

			assert.deepEqual(migrated, [path.join(userDataHomeDir, "store-path.json")]);
			assert.equal(fs.existsSync(path.join(userDataHomeDir, "config.json")), true);
			assert.equal(fs.existsSync(path.join(userDataHomeDir, "template.json")), true);
			assert.equal(fs.existsSync(path.join(userDataHomeDir, "store-path.json")), false);
		} finally {
			fs.rmSync(root, { force: true, recursive: true });
		}
	});
});
