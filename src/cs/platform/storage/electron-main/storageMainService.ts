/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
	AbstractStorageService,
	getStorageKey,
	getStorageKeyPrefix,
	StorageScope,
	type IStorageService,
} from "../common/storage.js";

const GLOBAL_STORAGE_DIRECTORY = "globalStorage";
const STORAGE_DATABASE_FILENAME = "state.csdb";

// state.csdb schema v1:
// - MetaTable stores database metadata, currently only schemaVersion.
// - ItemTable is the storage key-value table. Keys already include the storage scope prefix.
const ITEM_TABLE = "ItemTable";
const META_TABLE = "MetaTable";
const STORAGE_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = "schemaVersion";

type StorageMainServiceOptions = {
	readonly getHomeDir: () => string;
};

type StoredValues = Record<string, string>;
type StoredRow = {
	readonly key: unknown;
	readonly value: unknown;
};

const isStoredValues = (value: unknown): value is StoredValues =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value);

export class StorageMainService extends AbstractStorageService implements IStorageService {
	private values: StoredValues | null = null;

	constructor(private readonly options: StorageMainServiceOptions) {
		super();

		if (!options || typeof options.getHomeDir !== "function") {
			throw new Error("Main storage requires getHomeDir().");
		}
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.readValues()[this.storageKey(key, scope)];
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		const values = this.readValues();
		values[this.storageKey(key, scope)] = value;
		this.writeValues(values);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		const values = this.readValues();
		delete values[this.storageKey(key, scope)];
		this.writeValues(values);
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKeyPrefix(scope);
		return Object.keys(this.readValues())
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	private readValues(): StoredValues {
		if (this.values) {
			return this.values;
		}

		const raw = this.readStorageDatabase();
		const values: StoredValues = {};
		if (isStoredValues(raw)) {
			for (const [key, value] of Object.entries(raw)) {
				if (typeof value === "string") {
					values[key] = value;
				}
			}
		}

		this.values = values;
		return values;
	}

	private writeValues(values: StoredValues): void {
		this.values = values;
		this.writeStorageDatabase(values);
	}

	private storageKey(key: string, scope: StorageScope): string {
		return getStorageKey(key, scope);
	}

	private storageKeyPrefix(scope: StorageScope): string {
		return getStorageKeyPrefix(scope);
	}

	private storagePath(): string {
		return path.join(
			this.options.getHomeDir(),
			GLOBAL_STORAGE_DIRECTORY,
			STORAGE_DATABASE_FILENAME,
		);
	}

	private readStorageDatabase(): StoredValues | null {
		const storagePath = this.storagePath();
		if (fs.existsSync(storagePath)) {
			return readStateDatabaseFile(storagePath);
		}

		return null;
	}

	private writeStorageDatabase(values: StoredValues): void {
		writeStateDatabaseFile(this.storagePath(), values);
	}
}

export function createStorageMainService(options: StorageMainServiceOptions): IStorageService {
	return new StorageMainService(options);
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

function normalizeStoredValues(raw: unknown): StoredValues | null {
	if (!isStoredValues(raw)) {
		return null;
	}

	const values: StoredValues = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === "string") {
			values[key] = value;
		}
	}

	return values;
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
