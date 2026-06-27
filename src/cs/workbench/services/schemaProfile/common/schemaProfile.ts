/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	StructuredCanonicalUnit,
	StructuredMeasurementColumnRole,
	StructuredSchemaFingerprint,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ConfirmSchemaProfileInput } from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";

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
	readonly role: StructuredMeasurementColumnRole;
	readonly axis?: "x" | "y" | null;
	readonly canonicalUnit?: StructuredCanonicalUnit | null;
};

// User-confirmed evidence for an exact structured-content schema fingerprint.
// Consumers may use matching bindings as semantic evidence, but schemaProfile
// does not own resulting review candidates, blocks, or executable templates.
export type SchemaProfile = {
	readonly id?: string;
	readonly scope: SchemaProfileScope;
	readonly schemaFingerprint: StructuredSchemaFingerprint;
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
