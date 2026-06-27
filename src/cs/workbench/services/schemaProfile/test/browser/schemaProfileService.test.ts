/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	StorageScope,
	StorageTarget,
	type StorageValue,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { SchemaProfileService } from "src/cs/workbench/services/schemaProfile/browser/schemaProfileService";
import { SchemaProfileStoreService } from "src/cs/workbench/services/schemaProfile/browser/schemaProfileStoreService";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

const SCHEMA_PROFILE_STORAGE_KEY = "schemaProfile.profiles";

suite("workbench/services/schemaProfile/test/browser/schemaProfileService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("persists confirmed schema profiles with versioned snapshots", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));
		const snapshots: unknown[] = [];
		store.add(service.onDidChangeSchemaProfiles(snapshot => {
			snapshots.push(snapshot);
		}));

		const profile = service.upsertProfile(createProfile({
			id: "",
			schemaFingerprint: "inputa|outputb",
			confirmedCount: 2,
		}));

		assert.equal(profile.id, "schema:inputa|outputb");
		assert.equal(service.getVersion(), 1);
		assert.equal(service.getProfiles().length, 1);
		assert.equal(snapshots.length, 1);
		assert.deepEqual(
			storageService.getObject(SCHEMA_PROFILE_STORAGE_KEY, StorageScope.PROFILE),
			{
				version: 1,
				profiles: [profile],
			},
		);
	});

	test("restores and normalizes profiles from storage changes", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		storageService.store(
			SCHEMA_PROFILE_STORAGE_KEY,
			{
				version: 4,
				profiles: [
					createProfile({
						id: "valid",
						schemaFingerprint: "vg|id",
						confirmedCount: 1,
					}),
					{
						id: "invalid",
						schemaFingerprint: "bad",
						bindings: [{
							selector: {},
							role: "not-a-role",
						}],
					},
				],
			},
			StorageScope.PROFILE,
			StorageTarget.USER,
		);

		assert.equal(service.getVersion(), 4);
		assert.deepEqual(service.getProfiles().map(profile => profile.id), ["valid"]);
	});

	test("creates schema profiles from confirmed column mappings", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const profile = service.confirmProfile({
			schemaFingerprint: "dataname|inputa|outputb",
			columnProfiles: [{
				rawCol: 1,
				headerText: "Input A",
				normalizedHeader: "input a",
				kind: "numeric",
			}, {
				rawCol: 2,
				headerText: "Output B",
				normalizedHeader: "output b",
				kind: "numeric",
			}],
			bindings: [{
				rawCol: 1,
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}, {
				rawCol: 2,
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		});

		assert.ok(profile);
		assert.equal(profile.id, "schema:dataname|inputa|outputb");
		assert.equal(profile.confirmedCount, 1);
		assert.equal(profile.conflictCount, 0);
		assert.deepEqual(profile.bindings, [{
			selector: {
				columnIndex: 1,
				normalizedHeader: "input a",
			},
			role: "vg",
			axis: "x",
			canonicalUnit: "V",
		}, {
			selector: {
				columnIndex: 2,
				normalizedHeader: "output b",
			},
			role: "id",
			axis: "y",
			canonicalUnit: "A",
		}]);
		assert.equal(service.getVersion(), 1);
		assert.deepEqual(service.getProfiles(), [profile]);
	});

	test("increments repeated confirmations and records conflicting mappings", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const first = service.confirmProfile(createConfirmation({
			yRole: "id",
		}));
		const second = service.confirmProfile(createConfirmation({
			yRole: "id",
		}));
		const conflicted = service.confirmProfile(createConfirmation({
			yRole: "ig",
		}));

		assert.ok(first);
		assert.equal(first.confirmedCount, 1);
		assert.ok(second);
		assert.equal(second.confirmedCount, 2);
		assert.equal(second.conflictCount, 0);
		assert.ok(conflicted);
		assert.equal(conflicted.confirmedCount, 2);
		assert.equal(conflicted.conflictCount, 1);
		assert.deepEqual(service.getProfiles(), [conflicted]);
		assert.equal(service.getVersion(), 3);
	});

	test("deduplicates repeated confirmed bindings from multi-block templates", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const profile = service.confirmProfile({
			...createConfirmation({
				yRole: "id",
			}),
			bindings: [
				...createConfirmation({
					yRole: "id",
				}).bindings,
				...createConfirmation({
					yRole: "id",
				}).bindings,
			],
		});

		assert.ok(profile);
		assert.equal(profile.bindings.length, 2);
		assert.equal(service.getVersion(), 1);
	});

	test("does not persist same-column x/y confirmation conflicts", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const profile = service.confirmProfile({
			schemaFingerprint: "dataname|shared",
			columnProfiles: [{
				rawCol: 1,
				headerText: "Shared",
				normalizedHeader: "shared",
				kind: "numeric",
			}],
			bindings: [{
				rawCol: 1,
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}, {
				rawCol: 1,
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		});

		assert.equal(profile, null);
		assert.equal(service.getVersion(), 0);
		assert.deepEqual(service.getProfiles(), []);
	});

	test("does not persist confirmations for missing column profiles", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const profile = service.confirmProfile({
			schemaFingerprint: "dataname|missing",
			columnProfiles: [{
				rawCol: 1,
				headerText: "Input A",
				normalizedHeader: "input a",
				kind: "numeric",
			}],
			bindings: [{
				rawCol: 2,
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		});

		assert.equal(profile, null);
		assert.equal(service.getVersion(), 0);
		assert.deepEqual(service.getProfiles(), []);
	});

	test("persists role confirmations when canonical unit is unavailable", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const profile = service.confirmProfile({
			schemaFingerprint: "dataname|unitless",
			columnProfiles: [{
				rawCol: 1,
				headerText: "Input A",
				normalizedHeader: "input a",
				kind: "numeric",
			}],
			bindings: [{
				rawCol: 1,
				role: "vg",
				axis: "x",
			}],
		});

		assert.ok(profile);
		assert.equal(profile.bindings[0]?.canonicalUnit, null);
		assert.equal(profile.bindings[0]?.role, "vg");
		assert.equal(service.getVersion(), 1);
	});

	test("does not persist empty or unknown-role confirmations", () => {
		const storageService = store.add(new TestStorageService());
		const storeService = store.add(new SchemaProfileStoreService(storageService));
		const service = store.add(new SchemaProfileService(storeService));

		const profile = service.confirmProfile({
			schemaFingerprint: "dataname|x|y",
			columnProfiles: [{
				rawCol: 1,
				headerText: "X",
				normalizedHeader: "x",
				kind: "numeric",
			}],
			bindings: [{
				rawCol: 1,
				role: "unknown",
				canonicalUnit: null,
			}],
		});

		assert.equal(profile, null);
		assert.equal(service.getVersion(), 0);
		assert.deepEqual(service.getProfiles(), []);
	});
});

const createConfirmation = ({
	yRole,
}: {
	readonly yRole: "id" | "ig";
}) => ({
	schemaFingerprint: "dataname|inputa|outputb",
	columnProfiles: [{
		rawCol: 1,
		headerText: "Input A",
		normalizedHeader: "input a",
		kind: "numeric" as const,
	}, {
		rawCol: 2,
		headerText: "Output B",
		normalizedHeader: "output b",
		kind: "numeric" as const,
	}],
	bindings: [{
		rawCol: 1,
		role: "vg" as const,
		axis: "x" as const,
		canonicalUnit: "V" as const,
	}, {
		rawCol: 2,
		role: yRole,
		axis: "y" as const,
		canonicalUnit: "A" as const,
	}],
});

const createProfile = ({
	confirmedCount,
	id,
	schemaFingerprint,
}: {
	readonly confirmedCount: number;
	readonly id: string;
	readonly schemaFingerprint: string;
}): SchemaProfile => ({
	id,
	scope: "workspace",
	schemaFingerprint,
	confirmedCount,
	conflictCount: 0,
	bindings: [{
		selector: {
			columnIndex: 0,
			normalizedHeader: "input a",
		},
		role: "vg",
		canonicalUnit: "V",
	}],
});

class TestStorageService extends AbstractStorageService {
	private readonly values = new Map<string, string>();

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(this.storageKey(key, scope));
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		this.values.set(this.storageKey(key, scope), value);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		this.values.delete(this.storageKey(key, scope));
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKey("", scope);
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	public override store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void {
		super.store(key, value, scope, target);
	}

	private storageKey(key: string, scope: StorageScope): string {
		return `${scope}:${key}`;
	}
}
