/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IStorageService,
	StorageScope,
	StorageTarget,
	type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import type { MeasurementColumnRole } from "src/cs/workbench/services/assessment/common/measurement";
import type { CanonicalUnit } from "src/cs/workbench/services/assessment/common/semanticCandidate";
import {
	ISchemaProfileStoreService,
	type ISchemaProfileStoreService as ISchemaProfileStoreServiceType,
	type SchemaProfile,
	type SchemaProfileBinding,
	type SchemaProfileScope,
	type SchemaProfileSnapshot,
	type SchemaProfileSelector,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

const SCHEMA_PROFILE_STORAGE_KEY = "schemaProfile.profiles";

type StoredSchemaProfileState = {
	readonly version?: unknown;
	readonly profiles?: readonly unknown[];
};

export class SchemaProfileStoreService extends Disposable implements ISchemaProfileStoreServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSchemaProfilesEmitter =
		this._register(new Emitter<SchemaProfileSnapshot>());
	public readonly onDidChangeSchemaProfiles =
		this.onDidChangeSchemaProfilesEmitter.event;

	private snapshot: SchemaProfileSnapshot;

	public constructor(
		@IStorageService private readonly storageService: IStorageServiceType,
	) {
		super();
		this.snapshot = this.readSnapshotFromStorage();
		this.registerStorageListener();
	}

	public getSnapshot(): SchemaProfileSnapshot {
		return this.snapshot;
	}

	public upsertProfile(profile: SchemaProfile): SchemaProfile {
		const normalizedProfile = normalizeSchemaProfile(profile);
		if (!normalizedProfile) {
			return profile;
		}

		const nextProfiles = upsertProfile(this.snapshot.profiles, normalizedProfile);
		if (areProfilesEqual(this.snapshot.profiles, nextProfiles)) {
			return normalizedProfile;
		}

		this.storeSnapshot({
			version: this.snapshot.version + 1,
			profiles: nextProfiles,
		});
		return normalizedProfile;
	}

	public removeProfile(profileId: string): void {
		const normalizedProfileId = normalizeText(profileId);
		if (!normalizedProfileId) {
			return;
		}

		const nextProfiles = this.snapshot.profiles
			.filter(profile => normalizeText(profile.id) !== normalizedProfileId);
		if (nextProfiles.length === this.snapshot.profiles.length) {
			return;
		}

		this.storeSnapshot({
			version: this.snapshot.version + 1,
			profiles: nextProfiles,
		});
	}

	public clearProfiles(): void {
		if (!this.snapshot.profiles.length) {
			return;
		}

		this.storeSnapshot({
			version: this.snapshot.version + 1,
			profiles: [],
		});
	}

	private registerStorageListener(): void {
		const storageDisposables = this._register(new DisposableStore());
		this.storageService.onDidChangeValue(
			StorageScope.PROFILE,
			SCHEMA_PROFILE_STORAGE_KEY,
			storageDisposables,
		)(() => {
			this.setSnapshot(this.readSnapshotFromStorage());
		});
	}

	private readSnapshotFromStorage(): SchemaProfileSnapshot {
		const stored = this.storageService.getObject<StoredSchemaProfileState>(
			SCHEMA_PROFILE_STORAGE_KEY,
			StorageScope.PROFILE,
		);
		const version = normalizeVersion(stored?.version);
		const profiles = normalizeSchemaProfiles(stored?.profiles ?? []);
		return {
			version,
			profiles,
		};
	}

	private storeSnapshot(snapshot: SchemaProfileSnapshot): void {
		this.setSnapshot(snapshot);
		this.storageService.store(
			SCHEMA_PROFILE_STORAGE_KEY,
			snapshot,
			StorageScope.PROFILE,
			StorageTarget.USER,
		);
	}

	private setSnapshot(snapshot: SchemaProfileSnapshot): void {
		if (
			this.snapshot.version === snapshot.version &&
			areProfilesEqual(this.snapshot.profiles, snapshot.profiles)
		) {
			return;
		}

		this.snapshot = snapshot;
		this.onDidChangeSchemaProfilesEmitter.fire(snapshot);
	}
}

const upsertProfile = (
	profiles: readonly SchemaProfile[],
	profile: SchemaProfile,
): readonly SchemaProfile[] => {
	const profileId = normalizeText(profile.id);
	const fingerprint = normalizeText(profile.schemaFingerprint);
	const result = profiles.filter(existing =>
		normalizeText(existing.id) !== profileId &&
		normalizeText(existing.schemaFingerprint) !== fingerprint
	);
	result.push(profile);
	return result.sort(compareProfiles);
};

const normalizeSchemaProfiles = (
	values: readonly unknown[],
): readonly SchemaProfile[] => {
	const profiles: SchemaProfile[] = [];
	for (const value of values) {
		const profile = normalizeSchemaProfile(value);
		if (!profile) {
			continue;
		}
		const nextProfiles = upsertProfile(profiles, profile);
		profiles.length = 0;
		profiles.push(...nextProfiles);
	}
	return profiles;
};

const normalizeSchemaProfile = (
	value: unknown,
): SchemaProfile | null => {
	if (!isObjectRecord(value)) {
		return null;
	}

	const schemaFingerprint = normalizeText(value.schemaFingerprint);
	if (!schemaFingerprint) {
		return null;
	}

	const bindings = normalizeSchemaProfileBindings(value.bindings);
	if (!bindings.length) {
		return null;
	}

	const id = normalizeText(value.id) || createProfileId(schemaFingerprint);
	return {
		id,
		scope: normalizeScope(value.scope),
		schemaFingerprint,
		confirmedCount: normalizeCount(value.confirmedCount),
		conflictCount: normalizeCount(value.conflictCount),
		bindings,
	};
};

const normalizeSchemaProfileBindings = (
	value: unknown,
): readonly SchemaProfileBinding[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	const bindings: SchemaProfileBinding[] = [];
	for (const item of value) {
		if (!isObjectRecord(item)) {
			continue;
		}
		const selector = normalizeSelector(item.selector);
		if (!selector) {
			continue;
		}
		const role = normalizeRole(item.role);
		if (!role) {
			continue;
		}
		const canonicalUnit = normalizeCanonicalUnit(item.canonicalUnit);
		bindings.push({
			selector,
			role,
			axis: normalizeAxis(item.axis),
			canonicalUnit,
		});
	}

	return bindings;
};

const normalizeSelector = (
	value: unknown,
): SchemaProfileSelector | null => {
	if (!isObjectRecord(value)) {
		return null;
	}

	const columnIndex = normalizeColumnIndex(value.columnIndex);
	const normalizedHeader = normalizeText(value.normalizedHeader);
	if (columnIndex === undefined && !normalizedHeader) {
		return null;
	}

	return {
		columnIndex,
		normalizedHeader: normalizedHeader || undefined,
	};
};

const normalizeScope = (
	value: unknown,
): SchemaProfileScope =>
	value === "workspace" ? "workspace" : "workspace";

const normalizeRole = (
	value: unknown,
): MeasurementColumnRole | null => {
	if (
		value === "vd" ||
		value === "vg" ||
		value === "vs" ||
		value === "id" ||
		value === "ig" ||
		value === "is" ||
		value === "capacitance" ||
		value === "conductance" ||
		value === "time" ||
		value === "voltage" ||
		value === "current" ||
		value === "unknown"
	) {
		return value;
	}
	return null;
};

const normalizeCanonicalUnit = (
	value: unknown,
): CanonicalUnit | null =>
	value === "V" ||
	value === "A" ||
	value === "ohm" ||
	value === "s" ||
	value === "F" ||
	value === "Hz" ||
	value === "S"
		? value
		: null;

const normalizeAxis = (
	value: unknown,
): SchemaProfileBinding["axis"] =>
	value === "x" || value === "y" ? value : null;

const normalizeColumnIndex = (
	value: unknown,
): number | undefined => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number >= 0 ? number : undefined;
};

const normalizeCount = (
	value: unknown,
): number => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number > 0 ? number : 0;
};

const normalizeVersion = (
	value: unknown,
): number => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number >= 0 ? number : 0;
};

const normalizeText = (
	value: unknown,
): string =>
	String(value ?? "").trim();

const createProfileId = (
	schemaFingerprint: string,
): string =>
	`schema:${schemaFingerprint}`;

const compareProfiles = (
	a: SchemaProfile,
	b: SchemaProfile,
): number =>
	normalizeText(a.id).localeCompare(normalizeText(b.id));

const areProfilesEqual = (
	a: readonly SchemaProfile[],
	b: readonly SchemaProfile[],
): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

registerSingleton(ISchemaProfileStoreService, SchemaProfileStoreService, InstantiationType.Delayed);
