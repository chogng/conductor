/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	ISchemaProfileService,
	ISchemaProfileStoreService,
	type ISchemaProfileService as ISchemaProfileServiceType,
	type ISchemaProfileStoreService as ISchemaProfileStoreServiceType,
	type SchemaProfile,
	type SchemaProfileSnapshot,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	createSchemaProfileFromConfirmation,
	type ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";

export class SchemaProfileService extends Disposable implements ISchemaProfileServiceType {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeSchemaProfiles: ISchemaProfileServiceType["onDidChangeSchemaProfiles"];

	public constructor(
		@ISchemaProfileStoreService
		private readonly schemaProfileStoreService: ISchemaProfileStoreServiceType,
	) {
		super();
		this.onDidChangeSchemaProfiles =
			this.schemaProfileStoreService.onDidChangeSchemaProfiles;
	}

	public getSnapshot(): SchemaProfileSnapshot {
		return this.schemaProfileStoreService.getSnapshot();
	}

	public getProfiles(): readonly SchemaProfile[] {
		return this.getSnapshot().profiles;
	}

	public getVersion(): number {
		return this.getSnapshot().version;
	}

	public upsertProfile(profile: SchemaProfile): SchemaProfile {
		return this.schemaProfileStoreService.upsertProfile(profile);
	}

	public confirmProfile(input: ConfirmSchemaProfileInput): SchemaProfile | null {
		const profile = createSchemaProfileFromConfirmation(input);
		return profile ? this.upsertProfile(mergeConfirmedProfile(this.getProfiles(), profile)) : null;
	}

	public removeProfile(profileId: string): void {
		this.schemaProfileStoreService.removeProfile(profileId);
	}

	public clearProfiles(): void {
		this.schemaProfileStoreService.clearProfiles();
	}
}

const mergeConfirmedProfile = (
	profiles: readonly SchemaProfile[],
	profile: SchemaProfile,
): SchemaProfile => {
	const existing = profiles.find(candidate =>
		normalizeText(candidate.schemaFingerprint) === normalizeText(profile.schemaFingerprint)
	);
	if (!existing) {
		return profile;
	}

	if (!areBindingsEqual(existing.bindings, profile.bindings)) {
		return {
			...existing,
			conflictCount: Math.max(0, Math.floor(Number(existing.conflictCount) || 0)) + 1,
		};
	}

	return {
		...profile,
		id: normalizeText(existing.id) || profile.id,
		confirmedCount:
			Math.max(0, Math.floor(Number(existing.confirmedCount) || 0)) +
			Math.max(1, Math.floor(Number(profile.confirmedCount) || 1)),
		conflictCount: Math.max(0, Math.floor(Number(existing.conflictCount) || 0)),
	};
};

const areBindingsEqual = (
	a: SchemaProfile["bindings"],
	b: SchemaProfile["bindings"],
): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

const normalizeText = (
	value: unknown,
): string =>
	String(value ?? "").trim();

registerSingleton(ISchemaProfileService, SchemaProfileService, InstantiationType.Delayed);
