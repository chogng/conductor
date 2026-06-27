/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CanonicalUnit,
	MeasurementColumnRole,
	SchemaFingerprint,
} from "src/cs/workbench/services/table/common/tableProjection";
import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";

export const ISchemaProfileService =
	createDecorator<ISchemaProfileService>("schemaProfileService");

export const ISchemaProfileStoreService =
	createDecorator<ISchemaProfileStoreService>("schemaProfileStoreService");

export type SchemaProfileScope = "workspace";

export type SchemaProfileSelector = {
	readonly columnIndex?: number;
	readonly normalizedHeader?: string;
};

export type SchemaProfileBinding = {
	readonly selector: SchemaProfileSelector;
	readonly role: MeasurementColumnRole;
	readonly axis?: "x" | "y" | null;
	readonly canonicalUnit?: CanonicalUnit | null;
};

// User-confirmed evidence for an exact raw-table schema fingerprint.
// TableModel may consume matching bindings as semantic evidence, but the
// table-models record remains the canonical owner of resulting blocks/candidates.
export type SchemaProfile = {
	readonly id?: string;
	readonly scope: SchemaProfileScope;
	readonly schemaFingerprint: SchemaFingerprint;
	readonly confirmedCount: number;
	readonly conflictCount: number;
	readonly bindings: readonly SchemaProfileBinding[];
};

export type SchemaProfileSnapshot = {
	readonly version: number;
	readonly profiles: readonly SchemaProfile[];
};

export interface ISchemaProfileStoreService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSchemaProfiles: Event<SchemaProfileSnapshot>;

	clearProfiles(): void;
	getSnapshot(): SchemaProfileSnapshot;
	removeProfile(profileId: string): void;
	upsertProfile(profile: SchemaProfile): SchemaProfile;
}

export interface ISchemaProfileService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSchemaProfiles: Event<SchemaProfileSnapshot>;

	clearProfiles(): void;
	confirmProfile(input: ConfirmSchemaProfileInput): SchemaProfile | null;
	getProfiles(): readonly SchemaProfile[];
	getSnapshot(): SchemaProfileSnapshot;
	getVersion(): number;
	removeProfile(profileId: string): void;
	upsertProfile(profile: SchemaProfile): SchemaProfile;
}
