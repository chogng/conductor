/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	StructuredCanonicalUnit,
	StructuredColumnProfile,
	StructuredMeasurementColumnRole,
	StructuredSchemaFingerprint,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
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
	readonly role: StructuredMeasurementColumnRole;
	readonly axis?: "x" | "y" | null;
	readonly canonicalUnit?: StructuredCanonicalUnit | null;
};

export type ConfirmSchemaProfileInput = {
	readonly id?: string | null;
	readonly scope?: SchemaProfileScope;
	readonly schemaFingerprint: StructuredSchemaFingerprint;
	readonly columnProfiles: readonly StructuredColumnProfile[];
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
	readonly columnProfiles: readonly StructuredColumnProfile[];
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
		if (!profile) {
			return [];
		}
		const normalizedAxis = binding.axis === "x" || binding.axis === "y" ? binding.axis : null;
		const normalizedUnit = normalizeCanonicalUnit(binding.canonicalUnit);
		const normalizedHeader = normalizeHeader(
			profile.normalizedHeader || profile.headerText,
		);
		const selector = {
			columnIndex,
			normalizedHeader: normalizedHeader || undefined,
		};
		const key = `${selector.columnIndex}\u0000${selector.normalizedHeader ?? ""}`;
		if (seen.has(key)) {
			const existing = result.find(candidate =>
				candidate.selector.columnIndex === selector.columnIndex &&
				candidate.selector.normalizedHeader === selector.normalizedHeader
			);
			if (
				existing?.axis !== normalizedAxis ||
				existing?.role !== binding.role ||
				existing?.canonicalUnit !== normalizedUnit
			) {
				return [];
			}
			continue;
		}

		seen.add(key);
		result.push({
			selector,
			role: binding.role,
			axis: normalizedAxis,
			canonicalUnit: normalizedUnit,
		});
	}

	return result;
};

const isSupportedRole = (
	role: StructuredMeasurementColumnRole,
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
): StructuredCanonicalUnit | null =>
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
