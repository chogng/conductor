/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { URI } from "src/cs/base/common/uri";
import {
	StorageScope,
	StorageTarget,
} from "src/cs/platform/storage/common/storage";
import { createStorageMainService } from "src/cs/platform/storage/electron-main/storageMainService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	UNKNOWN_EMPTY_WINDOW_WORKSPACE,
	type IAnyWorkspaceIdentifier,
} from "src/cs/platform/workspaces/common/workspaceIdentifier";

const PROFILE_ID = "default";

suite("platform/storage/electron-main/storageMainService", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("keeps application and profile JSON while empty workspace stays in memory", async () => {
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
		assert.deepStrictEqual({
			applicationExists: fs.existsSync(applicationPath),
			profileExists: fs.existsSync(profilePath),
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
			columns: undefined,
			profileKeys: ["window.trayMinimizeHintShown"],
			applicationKeys: ["window.width"],
			workspaceKeys: [],
		});

		await second.close();
		second.dispose();
	});

	test("persists workspace values inside the opened folder SQLite database", async () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-home-"));
		const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-folder-"));
		const workspace = createFolderWorkspace(folderPath);
		const first = createTestStorageService(homeDir, workspace);
		await first.initialize();

		first.store(
			"review.result.v1:data.csv",
			{ state: "ready" },
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
		await first.close();
		first.dispose();

		const databasePath = path.join(folderPath, ".conductor", "state.vscdb");
		assert.equal(fs.existsSync(databasePath), true);
		assert.equal(
			fs.readFileSync(path.join(folderPath, ".conductor", ".gitignore"), "utf8"),
			"# Conductor workspace state\n*\n",
		);
		assert.deepStrictEqual(
			readSqliteItems(databasePath).get("review.result.v1:data.csv"),
			JSON.stringify({ state: "ready" }),
		);

		const second = createTestStorageService(homeDir, workspace);
		await second.initialize();
		assert.deepStrictEqual(
			second.getObject("review.result.v1:data.csv", StorageScope.WORKSPACE),
			{ state: "ready" },
		);
		await second.close();
		second.dispose();
	});

	test("switches workspace databases without leaking values between folders", async () => {
		const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-switch-"));
		const firstFolder = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-first-"));
		const secondFolder = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-storage-second-"));
		const service = createTestStorageService(homeDir, createFolderWorkspace(firstFolder));
		await service.initialize();

		service.store("review", "first", StorageScope.WORKSPACE, StorageTarget.MACHINE);
		await service.flush();
		await service.switchWorkspace(createFolderWorkspace(secondFolder));
		assert.equal(service.get("review", StorageScope.WORKSPACE), undefined);

		service.store("review", "second", StorageScope.WORKSPACE, StorageTarget.MACHINE);
		await service.flush();
		await service.switchWorkspace(createFolderWorkspace(firstFolder));
		assert.equal(service.get("review", StorageScope.WORKSPACE), "first");

		await service.close();
		service.dispose();
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
			workspace: UNKNOWN_EMPTY_WINDOW_WORKSPACE,
			logWarning: message => warnings.push(message),
		});
		await second.initialize();

		assert.equal(second.get("recoverable", StorageScope.PROFILE), "first");
		assert.equal(warnings.some(message => message.includes("Recovered storage")), true);
		await second.close();
		second.dispose();
	});

});

function createTestStorageService(
	homeDir: string,
	workspace: IAnyWorkspaceIdentifier = UNKNOWN_EMPTY_WINDOW_WORKSPACE,
) {
	return createStorageMainService({
		getHomeDir: () => homeDir,
		profileId: PROFILE_ID,
		workspace,
	});
}

function createFolderWorkspace(folderPath: string): IAnyWorkspaceIdentifier {
	return {
		id: `folder:${folderPath}`,
		uri: URI.file(folderPath),
	};
}

function readSqliteItems(storagePath: string): Map<string, string> {
	const database = new DatabaseSync(storagePath, { readOnly: true });
	try {
		return new Map(
			(database.prepare("SELECT key, value FROM ItemTable").all() as Array<{
				readonly key: string;
				readonly value: string;
			}>).map(row => [row.key, row.value]),
		);
	} finally {
		database.close();
	}
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
