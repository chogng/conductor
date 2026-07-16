/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";

import { Emitter, type Event as EventType } from "src/cs/base/common/event";
import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import {
	InMemoryStorageDatabase,
	Storage,
} from "src/cs/base/parts/storage/common/storage";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import {
	StorageChannel,
	StorageDatabaseClient,
} from "src/cs/platform/storage/common/storageIpc";

suite("platform/storage/common/storageIpc", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("reads and updates a scope in bulk", async () => {
		const storage = new Storage(new InMemoryStorageDatabase());
		await storage.init();
		const server = new StorageChannel({
			getStorage: () => storage,
		});
		const channel: IChannel = {
			call: (command, arg) => server.call("", command, arg),
			listen: (event, arg) => server.listen("", event, arg),
		};
		const client = new StorageDatabaseClient(channel, StorageScope.PROFILE);
		const changes: string[] = [];
		const changeListener = client.onDidChangeItemsExternal(event => {
			event.changed?.forEach((_value, key) => changes.push(`changed:${key}`));
			event.deleted?.forEach(key => changes.push(`deleted:${key}`));
		});

		assert.deepEqual(Array.from(await client.getItems()), []);
		await client.updateItems({
			insert: new Map([
				["sidebar.width", "320"],
				["sidebar.visible", "true"],
			]),
		});
		assert.deepEqual(Array.from(await client.getItems()), [
			["sidebar.width", "320"],
			["sidebar.visible", "true"],
		]);

		await client.updateItems({
			delete: new Set(["sidebar.visible"]),
		});
		assert.deepEqual(changes, [
			"changed:sidebar.width",
			"changed:sidebar.visible",
			"deleted:sidebar.visible",
		]);

		changeListener.dispose();
		client.dispose();
		await storage.close();
		storage.dispose();
	});

	test("merges changes received while the initial bulk read is pending", async () => {
		const changes = new Emitter<{
			readonly changed?: readonly (readonly [string, string])[];
			readonly deleted?: readonly string[];
		}>();
		const channel: IChannel = {
			async call<T>() {
				changes.fire({ changed: [["key", "new"]] });
				return [["key", "old"]] as T;
			},
			listen: <T>() => changes.event as EventType<T>,
		};
		const client = new StorageDatabaseClient(channel, StorageScope.PROFILE);

		assert.deepEqual(Array.from(await client.getItems()), [["key", "new"]]);

		client.dispose();
		changes.dispose();
	});
});
