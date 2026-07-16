/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";

import { Emitter, Event, type Event as EventType } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import {
	InMemoryStorageDatabase,
	Storage,
	type IStorage,
} from "src/cs/base/parts/storage/common/storage";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	StorageScope,
	STORAGE_TARGET_KEY,
	StorageTarget,
} from "src/cs/platform/storage/common/storage";
import {
	StorageChannel,
	StorageDatabaseClient,
} from "src/cs/platform/storage/common/storageIpc";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";

suite("platform/storage/common/storageIpc", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("reads and updates a scope in bulk", async () => {
		const storageService = new TestStorageServer();
		await storageService.initialize();
		const server = new StorageChannel(storageService);
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
		await storageService.close();
		storageService.dispose();
	});

	test("merges changes received while the initial bulk read is pending", async () => {
		const changes = new Emitter<{
			readonly key: string;
			readonly targetChanged: boolean;
			readonly changed?: readonly (readonly [string, string])[];
			readonly deleted?: readonly string[];
		}>();
		const channel: IChannel = {
			async call<T>() {
				changes.fire({
					key: "key",
					targetChanged: false,
					changed: [["key", "new"]],
				});
				return [["key", "old"]] as T;
			},
			listen: <T>() => changes.event as EventType<T>,
		};
		const client = new StorageDatabaseClient(channel, StorageScope.PROFILE);

		assert.deepEqual(Array.from(await client.getItems()), [["key", "new"]]);

		client.dispose();
		changes.dispose();
	});

	test("emits the owning key when only its target changes", async () => {
		const storageService = new TestStorageServer();
		await storageService.initialize();
		const server = new StorageChannel(storageService);
		const channel: IChannel = {
			call: (command, arg) => server.call("", command, arg),
			listen: (event, arg) => server.listen("", event, arg),
		};
		const first = new TestStorageClient(channel);
		const second = new TestStorageClient(channel);
		await Promise.all([first.initialize(), second.initialize()]);
		const changes: Array<{ readonly key: string; readonly target: StorageTarget | undefined }> = [];
		const changeDisposables = new DisposableStore();
		second.onDidChangeValue(
			StorageScope.PROFILE,
			"sidebar.width",
			changeDisposables,
		)(event => changes.push({ key: event.key, target: event.target }));

		first.store(
			"sidebar.width",
			"320",
			StorageScope.PROFILE,
			StorageTarget.USER,
		);
		await first.flush();
		changes.length = 0;
		first.store(
			"sidebar.width",
			"320",
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
		await first.flush();

		assert.deepStrictEqual(changes, [{
			key: "sidebar.width",
			target: StorageTarget.MACHINE,
		}]);

		changeDisposables.dispose();
		await Promise.all([first.close(), second.close()]);
		first.dispose();
		second.dispose();
		await storageService.close();
		storageService.dispose();
	});

	test("replaces the remote snapshot when close recovery is requested", async () => {
		const calls: Array<{ readonly command: string; readonly arg: unknown }> = [];
		const channel: IChannel = {
			async call<T>(command: string, arg?: unknown) {
				calls.push({ command, arg });
				return undefined as T;
			},
			listen: <T>() => Event.None as EventType<T>,
		};
		const client = new StorageDatabaseClient(channel, StorageScope.PROFILE);

		await client.close(() => new Map([["key", "value"]]));

		assert.deepStrictEqual(calls, [{
			command: "replaceItems",
			arg: {
				scope: StorageScope.PROFILE,
				insert: [["key", "value"]],
			},
		}]);
		client.dispose();
	});

	test("switches the workspace through the storage channel", async () => {
		const storageService = new TestStorageServer();
		await storageService.initialize();
		const server = new StorageChannel(storageService);

		await server.call("", "switchWorkspace", {
			id: "folder:test",
			uri: URI.file("C:/workspace/data"),
		});

		assert.equal(storageService.workspaceId, "folder:test");
		await storageService.close();
		storageService.dispose();
	});
});

class TestStorageServer extends AbstractStorageService {
	private readonly storage = new Storage(new InMemoryStorageDatabase());
	private readonly disposables = new DisposableStore();
	public workspaceId: string | undefined;

	constructor() {
		super();
		this.disposables.add(this.storage.onDidChangeStorage(event => {
			if (event.external) {
				this.fireDidChangeValueExternal(event.key, StorageScope.PROFILE);
			}
		}));
	}

	public getStorage(scope: StorageScope): IStorage {
		assert.strictEqual(scope, StorageScope.PROFILE);
		return this.storage;
	}

	public override async switchWorkspace(
		workspace: { readonly id: string },
	): Promise<void> {
		this.workspaceId = workspace.id;
	}

	protected override async doInitialize(): Promise<void> {
		await this.storage.init();
		this.initializeTargets(StorageScope.PROFILE);
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.getStorage(scope).get(key);
	}

	protected writeValue(
		key: string,
		scope: StorageScope,
		value: string,
	): Promise<void> {
		return this.getStorage(scope).set(key, value);
	}

	protected deleteValue(key: string, scope: StorageScope): Promise<void> {
		return this.getStorage(scope).delete(key);
	}

	protected readKeys(scope: StorageScope): string[] {
		return Array.from(this.getStorage(scope).items.keys());
	}

	protected override async doFlush(): Promise<void> {
		await this.storage.flush(0);
	}

	protected override async doClose(): Promise<void> {
		await this.storage.close();
	}

	public override dispose(): void {
		this.disposables.dispose();
		this.storage.dispose();
		super.dispose();
	}
}

class TestStorageClient extends AbstractStorageService {
	private readonly database: StorageDatabaseClient;
	private readonly storage: Storage;
	private readonly disposables = new DisposableStore();

	constructor(channel: IChannel) {
		super();
		this.database = new StorageDatabaseClient(channel, StorageScope.PROFILE);
		this.storage = new Storage(this.database);
		this.disposables.add(this.database);
		this.disposables.add(this.storage);
		this.disposables.add(this.database.onDidChangeValueExternal(event => {
			this.fireDidChangeValueExternal(
				event.targetChanged ? STORAGE_TARGET_KEY : event.key,
				StorageScope.PROFILE,
			);
		}));
	}

	protected override async doInitialize(): Promise<void> {
		await this.storage.init();
		this.initializeTargets(StorageScope.PROFILE);
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		assert.strictEqual(scope, StorageScope.PROFILE);
		return this.storage.get(key);
	}

	protected writeValue(
		key: string,
		scope: StorageScope,
		value: string,
	): Promise<void> {
		assert.strictEqual(scope, StorageScope.PROFILE);
		return this.storage.set(key, value);
	}

	protected deleteValue(key: string, scope: StorageScope): Promise<void> {
		assert.strictEqual(scope, StorageScope.PROFILE);
		return this.storage.delete(key);
	}

	protected readKeys(scope: StorageScope): string[] {
		assert.strictEqual(scope, StorageScope.PROFILE);
		return Array.from(this.storage.items.keys());
	}

	protected override async doFlush(): Promise<void> {
		await this.storage.flush(0);
	}

	protected override async doClose(): Promise<void> {
		await this.storage.close();
	}

	public override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}
