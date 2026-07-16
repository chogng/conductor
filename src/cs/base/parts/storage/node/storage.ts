/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";

import { Event, type Event as EventType } from "../../../common/event.js";
import {
	type IStorageDatabase,
	type IStorageItemsChangeEvent,
	type IUpdateRequest,
} from "../common/storage.js";

const STORAGE_FORMAT_VERSION = 1;

type JsonStorageDocument = {
	readonly version: typeof STORAGE_FORMAT_VERSION;
	readonly items: Record<string, string>;
};

export type JsonStorageDatabaseOptions = {
	readonly path: string;
	readonly logWarning?: (message: string, error?: unknown) => void;
};

export class JsonStorageDatabase implements IStorageDatabase {
	public readonly onDidChangeItemsExternal =
		Event.None as EventType<IStorageItemsChangeEvent>;

	private items = new Map<string, string>();
	private initialized = false;
	private hasValidPrimary = false;
	private writeFailed = false;

	constructor(private readonly options: JsonStorageDatabaseOptions) {
		if (!path.isAbsolute(options.path)) {
			throw new Error("JSON storage path must be absolute.");
		}
	}

	public async getItems(): Promise<Map<string, string>> {
		if (!this.initialized) {
			const primary = await this.readDocument(this.options.path);
			if (primary) {
				this.items = primary;
				this.hasValidPrimary = true;
			} else {
				const backup = await this.readDocument(this.backupPath);
				if (backup) {
					this.items = backup;
					this.warn(`Recovered storage from '${this.backupPath}'.`);
				}
			}
			this.initialized = true;
		}

		return new Map(this.items);
	}

	public async updateItems(request: IUpdateRequest): Promise<void> {
		await this.getItems();

		const nextItems = new Map(this.items);
		request.insert?.forEach((value, key) => nextItems.set(key, value));
		request.delete?.forEach(key => nextItems.delete(key));

		try {
			await this.writeItems(nextItems);
			this.items = nextItems;
			this.writeFailed = false;
		} catch (error) {
			this.writeFailed = true;
			throw error;
		}
	}

	public async optimize(): Promise<void> {
		await this.getItems();
		await this.writeItems(this.items);
	}

	public async close(recovery?: () => Map<string, string>): Promise<void> {
		if (!this.writeFailed || !recovery) {
			return;
		}

		await this.writeItems(recovery());
		this.writeFailed = false;
	}

	private get backupPath(): string {
		return `${this.options.path}.backup`;
	}

	private async readDocument(filePath: string): Promise<Map<string, string> | undefined> {
		let contents: string;
		try {
			contents = await fs.promises.readFile(filePath, "utf8");
		} catch (error) {
			if (isFileNotFound(error)) {
				return undefined;
			}
			this.warn(`Failed to read storage '${filePath}'.`, error);
			return undefined;
		}

		try {
			const parsed = JSON.parse(contents) as unknown;
			if (!isJsonStorageDocument(parsed)) {
				throw new Error("Unsupported storage document.");
			}

			return new Map(Object.entries(parsed.items));
		} catch (error) {
			this.warn(`Failed to parse storage '${filePath}'.`, error);
			return undefined;
		}
	}

	private async writeItems(items: Map<string, string>): Promise<void> {
		const directory = path.dirname(this.options.path);
		await fs.promises.mkdir(directory, { recursive: true });

		if (this.hasValidPrimary) {
			try {
				await fs.promises.copyFile(this.options.path, this.backupPath);
			} catch (error) {
				if (isFileNotFound(error)) {
					this.hasValidPrimary = false;
				} else {
					throw error;
				}
			}
		}

		const document: JsonStorageDocument = {
			version: STORAGE_FORMAT_VERSION,
			items: Object.fromEntries(items),
		};
		const temporaryPath = path.join(
			directory,
			`.${path.basename(this.options.path)}.${process.pid}.tmp`,
		);
		try {
			const handle = await fs.promises.open(temporaryPath, "w", 0o600);
			try {
				await handle.writeFile(`${JSON.stringify(document)}\n`, "utf8");
				await handle.sync();
			} finally {
				await handle.close();
			}

			await fs.promises.rename(temporaryPath, this.options.path);
			this.hasValidPrimary = true;
		} catch (error) {
			await fs.promises.rm(temporaryPath, { force: true });
			throw error;
		}
	}

	private warn(message: string, error?: unknown): void {
		(this.options.logWarning ?? console.warn)(message, error);
	}
}

function isJsonStorageDocument(value: unknown): value is JsonStorageDocument {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const candidate = value as {
		readonly version?: unknown;
		readonly items?: unknown;
	};
	if (
		candidate.version !== STORAGE_FORMAT_VERSION ||
		!candidate.items ||
		typeof candidate.items !== "object" ||
		Array.isArray(candidate.items)
	) {
		return false;
	}

	return Object.values(candidate.items).every(item => typeof item === "string");
}

function isFileNotFound(error: unknown): boolean {
	return Boolean(
		error &&
		typeof error === "object" &&
		(error as { readonly code?: unknown }).code === "ENOENT",
	);
}
