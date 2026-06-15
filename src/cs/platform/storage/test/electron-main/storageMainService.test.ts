/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	StorageScope,
	StorageTarget,
} from "src/cs/platform/storage/common/storage";
import { createStorageMainService } from "src/cs/platform/storage/electron-main/storageMainService";

suite("platform/storage/electron-main/storageMainService", () => {
	test("persists scoped values across service instances", () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-test-"));
		const first = createStorageMainService({ getHomeDir: () => homeDir });

		first.store("window.trayMinimizeHintShown", true, StorageScope.PROFILE, StorageTarget.USER);
		first.store("window.width", 1200, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const second = createStorageMainService({ getHomeDir: () => homeDir });
		const storagePath = path.join(homeDir, "globalStorage", "state.csdb");

		assert.deepStrictEqual({
			hasStateDatabase: fs.existsSync(storagePath),
			stateDatabaseHeader: fs.readFileSync(storagePath).subarray(0, 16).toString("utf8"),
			schemaVersion: readStorageSchemaVersion(storagePath),
			itemRows: readStorageRows(storagePath),
			profileHint: second.getBoolean("window.trayMinimizeHintShown", StorageScope.PROFILE),
			applicationHint: second.getBoolean("window.trayMinimizeHintShown", StorageScope.APPLICATION),
			width: second.getNumber("window.width", StorageScope.APPLICATION),
			profileKeys: second.keys(StorageScope.PROFILE),
			applicationKeys: second.keys(StorageScope.APPLICATION),
		}, {
			hasStateDatabase: true,
			stateDatabaseHeader: "SQLite format 3\u0000",
			schemaVersion: "1",
			itemRows: [
				{
					key: "conductor.storage.-1.window.width",
					value: "1200",
				},
				{
					key: "conductor.storage.0.window.trayMinimizeHintShown",
					value: "true",
				},
			],
			profileHint: true,
			applicationHint: undefined,
			width: 1200,
			profileKeys: ["window.trayMinimizeHintShown"],
			applicationKeys: ["window.width"],
		});
	});

});

function readStorageSchemaVersion(storagePath: string): string | undefined {
	const database = new DatabaseSync(storagePath);
	try {
		const row = database
			.prepare("SELECT value FROM MetaTable WHERE key = ?")
			.get("schemaVersion") as { readonly value?: unknown } | undefined;
		return typeof row?.value === "string" ? row.value : undefined;
	} finally {
		database.close();
	}
}

function readStorageRows(storagePath: string): Array<{ readonly key: string; readonly value: string }> {
	const database = new DatabaseSync(storagePath);
	try {
		const rows = database
			.prepare("SELECT key, value FROM ItemTable ORDER BY key")
			.all() as Array<{ readonly key: string; readonly value: string }>;
		return rows.map(row => ({
			key: row.key,
			value: row.value,
		}));
	} finally {
		database.close();
	}
}
