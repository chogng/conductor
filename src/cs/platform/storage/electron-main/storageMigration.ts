/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	StorageScope,
	STORAGE_TARGET_KEY,
	StorageTarget,
} from "../common/storage.js";
import {
	GLOBAL_STORAGE_DIRECTORY,
	type IStorageMain,
} from "./storageMain.js";

const LEGACY_STORAGE_DATABASE_FILENAME = "state.csdb";
const LEGACY_STORAGE_KEY_PREFIX = "conductor.storage";
const LEGACY_ITEM_TABLE = "ItemTable";

type LegacyStorageRow = {
	readonly key: unknown;
	readonly value: unknown;
};

export type LegacyStorageMigrationOptions = {
	readonly getHomeDir: () => string;
	readonly getStorage: (scope: StorageScope) => IStorageMain;
	readonly logWarning?: (message: string, error?: unknown) => void;
};

// TODO(migration): One-time bridge from the scoped SQLite storage replaced by
// JSON storage in 3dcd3100. Boundary: only globalStorage/state.csdb is read and
// archived. Delete when direct upgrades from builds before 3dcd3100 are no
// longer supported.
export async function migrateLegacyStorage(
	options: LegacyStorageMigrationOptions,
): Promise<void> {
	const legacyPath = path.join(
		options.getHomeDir(),
		GLOBAL_STORAGE_DIRECTORY,
		LEGACY_STORAGE_DATABASE_FILENAME,
	);
	const archivePath = `${legacyPath}.migrated`;
	if (!fs.existsSync(legacyPath) || fs.existsSync(archivePath)) {
		return;
	}

	try {
		const scopedValues = readLegacyStorage(legacyPath);
		for (const scope of ALL_STORAGE_SCOPES) {
			await migrateScope(
				options.getStorage(scope),
				scopedValues.get(scope) ?? new Map(),
			);
		}
		await archiveLegacyStorage(legacyPath, archivePath);
	} catch (error) {
		(options.logWarning ?? console.warn)(
			`Failed to migrate legacy storage '${legacyPath}'.`,
			error,
		);
		throw error;
	}
}

const ALL_STORAGE_SCOPES = [
	StorageScope.APPLICATION,
	StorageScope.PROFILE,
	StorageScope.WORKSPACE,
] as const;

function readLegacyStorage(
	legacyPath: string,
): Map<StorageScope, Map<string, string>> {
	const result = new Map<StorageScope, Map<string, string>>();
	const database = new DatabaseSync(legacyPath);
	try {
		const rows = database
			.prepare(`SELECT key, value FROM ${LEGACY_ITEM_TABLE}`)
			.all() as LegacyStorageRow[];
		for (const row of rows) {
			if (typeof row.key !== "string" || typeof row.value !== "string") {
				continue;
			}

			const parsed = parseLegacyStorageKey(row.key);
			if (!parsed) {
				continue;
			}

			let scopeValues = result.get(parsed.scope);
			if (!scopeValues) {
				scopeValues = new Map();
				result.set(parsed.scope, scopeValues);
			}
			scopeValues.set(parsed.key, row.value);
		}
	} finally {
		database.close();
	}

	return result;
}

async function migrateScope(
	storage: IStorageMain,
	legacyValues: Map<string, string>,
): Promise<void> {
	const targets = readTargets(storage.get(STORAGE_TARGET_KEY));
	const writes: Promise<void>[] = [];
	let didMigrate = false;

	for (const [key, value] of legacyValues) {
		if (storage.get(key) !== undefined) {
			continue;
		}

		didMigrate = true;
		targets.set(key, StorageTarget.USER);
		writes.push(storage.set(key, value));
	}

	if (!didMigrate) {
		return;
	}

	writes.push(storage.set(
		STORAGE_TARGET_KEY,
		JSON.stringify(Object.fromEntries(targets)),
	));
	await Promise.all(writes);
	await storage.flush(0);
}

function readTargets(rawTargets: string | undefined): Map<string, StorageTarget> {
	const targets = new Map<string, StorageTarget>();
	if (!rawTargets) {
		return targets;
	}

	try {
		const parsed = JSON.parse(rawTargets) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return targets;
		}

		for (const [key, target] of Object.entries(parsed)) {
			if (target === StorageTarget.USER || target === StorageTarget.MACHINE) {
				targets.set(key, target);
			}
		}
	} catch {
		// A malformed new target marker should not prevent legacy value recovery.
	}

	return targets;
}

function parseLegacyStorageKey(
	value: string,
): { readonly scope: StorageScope; readonly key: string } | undefined {
	for (const scope of ALL_STORAGE_SCOPES) {
		const prefix = `${LEGACY_STORAGE_KEY_PREFIX}.${scope}.`;
		if (value.startsWith(prefix) && value.length > prefix.length) {
			return {
				scope,
				key: value.slice(prefix.length),
			};
		}
	}

	return undefined;
}

async function archiveLegacyStorage(
	legacyPath: string,
	archivePath: string,
): Promise<void> {
	await fs.promises.rename(legacyPath, archivePath);
	for (const suffix of ["-wal", "-shm"]) {
		const sidecarPath = `${legacyPath}${suffix}`;
		if (fs.existsSync(sidecarPath)) {
			await fs.promises.rename(sidecarPath, `${archivePath}${suffix}`);
		}
	}
}
