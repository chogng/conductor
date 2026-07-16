/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";

import { Event, type Event as EventType } from "src/cs/base/common/event";
import {
	Storage,
	StorageHint,
	type IStorageDatabase,
	type IStorageItemsChangeEvent,
	type IUpdateRequest,
} from "src/cs/base/parts/storage/common/storage";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/parts/storage/common/storage", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("retries a failed update without losing pending values", async () => {
		const database = new FlakyStorageDatabase();
		const storage = new Storage(database, {
			hint: StorageHint.STORAGE_IN_MEMORY,
		});
		await storage.init();

		await assert.rejects(storage.set("key", "value"));
		assert.equal(database.items.get("key"), undefined);

		const whenFlushed = storage.whenFlushed();
		await storage.flush(0);
		await whenFlushed;
		assert.equal(database.items.get("key"), "value");

		await storage.close();
		storage.dispose();
	});

	test("uses database recovery when the final close flush fails", async () => {
		const database = new CloseRecoveryStorageDatabase();
		const storage = new Storage(database, {
			hint: StorageHint.STORAGE_IN_MEMORY,
		});
		await storage.init();

		await assert.rejects(storage.set("key", "value"));
		const originalWarn = console.warn;
		console.warn = () => undefined;
		try {
			await assert.rejects(storage.close());
			await storage.close();
		} finally {
			console.warn = originalWarn;
		}

		assert.equal(database.items.get("key"), "value");
		assert.equal(database.didRecover, true);
		storage.dispose();
	});
});

class FlakyStorageDatabase implements IStorageDatabase {
	public readonly onDidChangeItemsExternal =
		Event.None as EventType<IStorageItemsChangeEvent>;
	public readonly items = new Map<string, string>();
	private attempts = 0;

	public async getItems(): Promise<Map<string, string>> {
		return new Map(this.items);
	}

	public async updateItems(request: IUpdateRequest): Promise<void> {
		this.attempts += 1;
		if (this.attempts === 1) {
			throw new Error("expected write failure");
		}

		request.insert?.forEach((value, key) => this.items.set(key, value));
		request.delete?.forEach(key => this.items.delete(key));
	}

	public async optimize(): Promise<void> {}
	public async close(): Promise<void> {}
}

class CloseRecoveryStorageDatabase implements IStorageDatabase {
	public readonly onDidChangeItemsExternal =
		Event.None as EventType<IStorageItemsChangeEvent>;
	public readonly items = new Map<string, string>();
	public didRecover = false;
	private closeAttempts = 0;

	public async getItems(): Promise<Map<string, string>> {
		return new Map(this.items);
	}

	public async updateItems(): Promise<void> {
		throw new Error("expected persistent write failure");
	}

	public async optimize(): Promise<void> {}

	public async close(recovery?: () => Map<string, string>): Promise<void> {
		assert.ok(recovery);
		this.closeAttempts += 1;
		if (this.closeAttempts === 1) {
			throw new Error("expected recovery write failure");
		}
		this.didRecover = true;
		recovery().forEach((value, key) => this.items.set(key, value));
	}
}
