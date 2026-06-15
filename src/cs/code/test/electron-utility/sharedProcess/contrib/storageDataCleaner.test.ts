/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { deleteEmptyWorkspaceStorageFolders } from "src/cs/code/electron-utility/sharedProcess/contrib/storageDataCleaner";

suite("code/electron-utility/sharedProcess/contrib/storageDataCleaner", () => {
	function createTempDir(): string {
		return fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-data-cleanup-"));
	}

	test("deletes empty workspace storage folders", () => {
		const root = createTempDir();
		try {
			const workspaceStorageHome = path.join(root, "User", "workspaceStorage");
			const emptyWorkspace = path.join(workspaceStorageHome, "empty-window");
			const nonEmptyWorkspace = path.join(workspaceStorageHome, "active-window");
			fs.mkdirSync(emptyWorkspace, { recursive: true });
			fs.mkdirSync(nonEmptyWorkspace, { recursive: true });
			fs.writeFileSync(path.join(nonEmptyWorkspace, "state.csdb"), "", "utf8");

			const deleted = deleteEmptyWorkspaceStorageFolders(workspaceStorageHome)
				.map(filePath => path.basename(filePath));

			assert.deepEqual(deleted, ["empty-window"]);
			assert.equal(fs.existsSync(emptyWorkspace), false);
			assert.equal(fs.existsSync(nonEmptyWorkspace), true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("ignores missing workspace storage home", () => {
		const root = createTempDir();
		try {
			const deleted = deleteEmptyWorkspaceStorageFolders(path.join(root, "User", "workspaceStorage"));

			assert.deepEqual(deleted, []);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
