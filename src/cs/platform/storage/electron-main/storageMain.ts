/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const GLOBAL_STORAGE_DIRECTORY = "globalStorage";
export const STORAGE_DATABASE_FILENAME = "state.csdb";

// state.csdb schema v1:
// - MetaTable stores database metadata, currently only schemaVersion.
// - ItemTable is the storage key-value table. Keys already include the storage scope prefix.
const ITEM_TABLE = "ItemTable";
const META_TABLE = "MetaTable";
const STORAGE_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = "schemaVersion";

export type StorageMainOptions = {
	readonly getHomeDir: () => string;
};

export type StoredValues = Record<string, string>;

type StoredRow = {
	readonly key: unknown;
	readonly value: unknown;
};

export interface IStorageMain {
	readonly path: string;

	readValues(): StoredValues;
	writeValues(values: StoredValues): void;
}

export class StorageMain implements IStorageMain {
	constructor(private readonly options: StorageMainOptions) {
		if (!options || typeof options.getHomeDir !== "function") {
			throw new Error("Main storage requires getHomeDir().");
		}
	}

	public get path(): string {
		return path.join(
			this.options.getHomeDir(),
			GLOBAL_STORAGE_DIRECTORY,
			STORAGE_DATABASE_FILENAME,
		);
	}

	public readValues(): StoredValues {
		if (!fs.existsSync(this.path)) {
			return {};
		}

		return readStateDatabaseFile(this.path) ?? {};
	}

	public writeValues(values: StoredValues): void {
		writeStateDatabaseFile(this.path, values);
	}
}

function ensureDirectoryForFile(filePath: string): void {
	const directory = path.dirname(filePath);
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

function readStateDatabaseFile(filePath: string): StoredValues | null {
	let database: DatabaseSync | null = null;
	try {
		database = openStorageDatabase(filePath);
		const rows = database
			.prepare(`SELECT key, value FROM ${ITEM_TABLE}`)
			.all() as StoredRow[];
		const values: StoredValues = {};
		for (const row of rows) {
			if (typeof row.key === "string" && typeof row.value === "string") {
				values[row.key] = row.value;
			}
		}

		return values;
	} catch {
		return null;
	} finally {
		database?.close();
	}
}

function writeStateDatabaseFile(filePath: string, values: StoredValues): void {
	ensureDirectoryForFile(filePath);
	const database = openStorageDatabase(filePath);
	try {
		database.exec("BEGIN TRANSACTION");
		database.exec(`DELETE FROM ${ITEM_TABLE}`);
		const insert = database.prepare(
			`INSERT INTO ${ITEM_TABLE} (key, value) VALUES (?, ?)`,
		);
		for (const [key, value] of Object.entries(values)) {
			insert.run(key, value);
		}
		database.exec("COMMIT");
	} catch (error) {
		try {
			database.exec("ROLLBACK");
		} catch {
			// Ignore rollback failures; the original write error is more useful.
		}
		throw error;
	} finally {
		database.close();
	}
}

function openStorageDatabase(filePath: string): DatabaseSync {
	const database = new DatabaseSync(filePath);
	database.exec("PRAGMA journal_mode = WAL");
	database.exec("PRAGMA busy_timeout = 2000");
	database.exec(`
		CREATE TABLE IF NOT EXISTS ${ITEM_TABLE} (
			key TEXT PRIMARY KEY,
			value TEXT
		)
	`);
	database.exec(`
		CREATE TABLE IF NOT EXISTS ${META_TABLE} (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)
	`);
	ensureStorageSchemaVersion(database);
	return database;
}

function ensureStorageSchemaVersion(database: DatabaseSync): void {
	const row = database
		.prepare(`SELECT value FROM ${META_TABLE} WHERE key = ?`)
		.get(SCHEMA_VERSION_KEY) as { readonly value?: unknown } | undefined;
	const currentVersion = Number(row?.value ?? STORAGE_SCHEMA_VERSION);

	if (!Number.isInteger(currentVersion) || currentVersion > STORAGE_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported storage database schema version: ${String(row?.value)}`,
		);
	}

	database
		.prepare(`INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
		.run(SCHEMA_VERSION_KEY, String(STORAGE_SCHEMA_VERSION));
}
