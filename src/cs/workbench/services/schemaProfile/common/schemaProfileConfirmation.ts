/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CanonicalUnit,
	ColumnProfile,
	MeasurementColumnRole,
	SchemaFingerprint,
} from "src/cs/workbench/services/table/common/tableProjection";
import {
	normalizeCellText,
} from "src/cs/workbench/common/cellText";
import type {
	SchemaProfile,
	SchemaProfileBinding,
	SchemaProfileScope,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export type SchemaProfileConfirmationBinding = {
	readonly rawCol: number;
	readonly role: MeasurementColumnRole;
	readonly axis?: "x" | "y" | null;
	readonly canonicalUnit?: CanonicalUnit | null;
};

export type ConfirmSchemaProfileInput = {
	readonly id?: string | null;
	readonly scope?: SchemaProfileScope;
	readonly schemaFingerprint: SchemaFingerprint;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly bindings: readonly SchemaProfileConfirmationBinding[];
};

export const createSchemaProfileFromConfirmation = ({
	id,
	scope = "workspace",
	schemaFingerprint,
	columnProfiles,
	bindings,
}: ConfirmSchemaProfileInput): SchemaProfile | null => {
	const fingerprint = normalizeText(schemaFingerprint);
	if (!fingerprint) {
		return null;
	}

	const profileBindings = createBindings({
		bindings,
		columnProfiles,
	});
	if (!profileBindings.length) {
		return null;
	}

	return {
		id: normalizeText(id) || undefined,
		scope,
		schemaFingerprint: fingerprint,
		confirmedCount: 1,
		conflictCount: 0,
		bindings: profileBindings,
	};
};

const createBindings = ({
	bindings,
	columnProfiles,
}: {
	readonly bindings: readonly SchemaProfileConfirmationBinding[];
	readonly columnProfiles: readonly ColumnProfile[];
}): readonly SchemaProfileBinding[] => {
	const profilesByColumn = new Map(columnProfiles.map(profile => [profile.rawCol, profile]));
	const result: SchemaProfileBinding[] = [];
	const seen = new Set<string>();
	for (const binding of bindings) {
		if (!isSupportedRole(binding.role)) {
			continue;
		}

		const columnIndex = normalizeColumnIndex(binding.rawCol);
		if (columnIndex === undefined) {
			continue;
		}

		const profile = profilesByColumn.get(columnIndex);
		const normalizedHeader = normalizeHeader(
			profile?.normalizedHeader || profile?.headerText,
		);
		const selector = {
			columnIndex,
			normalizedHeader: normalizedHeader || undefined,
		};
		const key = `${selector.columnIndex}\u0000${selector.normalizedHeader ?? ""}`;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push({
			selector,
			role: binding.role,
			axis: binding.axis === "x" || binding.axis === "y" ? binding.axis : null,
			canonicalUnit: normalizeCanonicalUnit(binding.canonicalUnit),
		});
	}

	return result;
};

const isSupportedRole = (
	role: MeasurementColumnRole,
): boolean =>
	role !== "unknown";

const normalizeColumnIndex = (
	value: unknown,
): number | undefined => {
	const number = Math.floor(Number(value));
	return Number.isFinite(number) && number >= 0 ? number : undefined;
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

const normalizeHeader = (
	value: unknown,
): string =>
	normalizeCellText(value)
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();

const normalizeText = (
	value: unknown,
): string =>
	String(value ?? "").trim();
