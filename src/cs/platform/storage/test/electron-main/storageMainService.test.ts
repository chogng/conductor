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
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

const PROFILE_ID = "default";
const WORKSPACE_ID = "empty-window";

suite("platform/storage/electron-main/storageMainService", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("persists values in separate JSON files by scope", async () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-test-"));
		const first = createTestStorageService(homeDir);
		await first.initialize();

		first.store(
			"window.trayMinimizeHintShown",
			true,
			StorageScope.PROFILE,
			StorageTarget.USER,
		);
		first.store(
			"window.width",
			1200,
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
		first.store(
			"table.columns",
			{ widths: [120, 240] },
			StorageScope.WORKSPACE,
			StorageTarget.USER,
		);
		await first.flush();
		await first.close();
		first.dispose();

		const second = createTestStorageService(homeDir);
		await second.initialize();

		const applicationPath = path.join(
			homeDir,
			"globalStorage",
			"application.json",
		);
		const profilePath = path.join(
			homeDir,
			"globalStorage",
			"profiles",
			PROFILE_ID,
			"state.json",
		);
		const workspacePath = path.join(
			homeDir,
			"workspaceStorage",
			WORKSPACE_ID,
			"state.json",
		);

		assert.deepStrictEqual({
			applicationExists: fs.existsSync(applicationPath),
			profileExists: fs.existsSync(profilePath),
			workspaceExists: fs.existsSync(workspacePath),
			applicationVersion: readStorageVersion(applicationPath),
			profileTargets: readStorageTargets(profilePath),
			applicationTargets: readStorageTargets(applicationPath),
			profileHint: second.getBoolean(
				"window.trayMinimizeHintShown",
				StorageScope.PROFILE,
			),
			applicationHint: second.getBoolean(
				"window.trayMinimizeHintShown",
				StorageScope.APPLICATION,
			),
			width: second.getNumber("window.width", StorageScope.APPLICATION),
			columns: second.getObject("table.columns", StorageScope.WORKSPACE),
			profileKeys: second.keys(StorageScope.PROFILE),
			applicationKeys: second.keys(StorageScope.APPLICATION),
			workspaceKeys: second.keys(StorageScope.WORKSPACE),
		}, {
			applicationExists: true,
			profileExists: true,
			workspaceExists: true,
			applicationVersion: 1,
			profileTargets: {
				"window.trayMinimizeHintShown": StorageTarget.USER,
			},
			applicationTargets: {
				"window.width": StorageTarget.MACHINE,
			},
			profileHint: true,
			applicationHint: undefined,
			width: 1200,
			columns: { widths: [120, 240] },
			profileKeys: ["window.trayMinimizeHintShown"],
			applicationKeys: ["window.width"],
			workspaceKeys: ["table.columns"],
		});

		await second.close();
		second.dispose();
	});

	test("persists large values", async () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-large-"));
		const largeValue = "x".repeat(64 * 1024);
		const first = createTestStorageService(homeDir);
		await first.initialize();
		first.store(
			"schema.profiles",
			largeValue,
			StorageScope.PROFILE,
			StorageTarget.USER,
		);
		await first.close();
		first.dispose();

		const second = createTestStorageService(homeDir);
		await second.initialize();
		assert.equal(
			second.get("schema.profiles", StorageScope.PROFILE),
			largeValue,
		);
		await second.close();
		second.dispose();
	});

	test("recovers the last valid JSON backup", async () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-recovery-"));
		const first = createTestStorageService(homeDir);
		await first.initialize();
		first.store("recoverable", "first", StorageScope.PROFILE, StorageTarget.USER);
		await first.flush();
		first.store("recoverable", "second", StorageScope.PROFILE, StorageTarget.USER);
		await first.flush();
		await first.close();
		first.dispose();

		const profilePath = path.join(
			homeDir,
			"globalStorage",
			"profiles",
			PROFILE_ID,
			"state.json",
		);
		fs.writeFileSync(profilePath, "{broken", "utf8");

		const warnings: string[] = [];
		const second = createStorageMainService({
			getHomeDir: () => homeDir,
			profileId: PROFILE_ID,
			workspaceId: WORKSPACE_ID,
			logWarning: message => warnings.push(message),
		});
		await second.initialize();

		assert.equal(second.get("recoverable", StorageScope.PROFILE), "first");
		assert.equal(warnings.some(message => message.includes("Recovered storage")), true);
		await second.close();
		second.dispose();
	});

	test("migrates and archives the legacy scoped SQLite database", async () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-migration-"));
		const legacyPath = path.join(homeDir, "globalStorage", "state.csdb");
		writeLegacyStorage(legacyPath, [
			["conductor.storage.-1.window.width", "1200"],
			["conductor.storage.0.schema.profiles", "[{\"id\":\"legacy\"}]"],
			["conductor.storage.1.table.columns", "{\"widths\":[120,240]}"],
		]);

		const service = createTestStorageService(homeDir);
		await service.initialize();

		assert.deepStrictEqual({
			application: service.getNumber("window.width", StorageScope.APPLICATION),
			profile: service.getObject("schema.profiles", StorageScope.PROFILE),
			workspace: service.getObject("table.columns", StorageScope.WORKSPACE),
			legacyExists: fs.existsSync(legacyPath),
			archiveExists: fs.existsSync(`${legacyPath}.migrated`),
		}, {
			application: 1200,
			profile: [{ id: "legacy" }],
			workspace: { widths: [120, 240] },
			legacyExists: false,
			archiveExists: true,
		});

		await service.close();
		service.dispose();
	});
});

function createTestStorageService(homeDir: string) {
	return createStorageMainService({
		getHomeDir: () => homeDir,
		profileId: PROFILE_ID,
		workspaceId: WORKSPACE_ID,
	});
}

function readStorageVersion(storagePath: string): number | undefined {
	const parsed = JSON.parse(fs.readFileSync(storagePath, "utf8")) as {
		readonly version?: unknown;
	};
	return typeof parsed.version === "number" ? parsed.version : undefined;
}

function readStorageTargets(storagePath: string): Record<string, number> | undefined {
	const parsed = JSON.parse(fs.readFileSync(storagePath, "utf8")) as {
		readonly items?: Record<string, string>;
	};
	const rawTargets = parsed.items?.["__$__targetStorageMarker"];
	return rawTargets
		? JSON.parse(rawTargets) as Record<string, number>
		: undefined;
}

function writeLegacyStorage(
	storagePath: string,
	rows: readonly (readonly [string, string])[],
): void {
	fs.mkdirSync(path.dirname(storagePath), { recursive: true });
	const database = new DatabaseSync(storagePath);
	try {
		database.exec(`
			CREATE TABLE ItemTable (
				key TEXT PRIMARY KEY,
				value TEXT
			)
		`);
		const insert = database.prepare(
			"INSERT INTO ItemTable (key, value) VALUES (?, ?)",
		);
		for (const [key, value] of rows) {
			insert.run(key, value);
		}
	} finally {
		database.close();
	}
}
