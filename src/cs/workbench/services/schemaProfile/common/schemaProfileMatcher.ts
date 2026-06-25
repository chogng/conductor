/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { normalizeCellText } from "src/cs/workbench/common/cellText";
import type { ColumnProfile } from "src/cs/workbench/services/tableModel/common/columnProfile";
import type { SchemaFingerprint } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type {
	SchemaProfile,
	SchemaProfileBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export type ExactSchemaProfileMatch = {
	readonly profile: SchemaProfile;
	readonly confidence: number;
	readonly reason: "exactFingerprint";
};

export const findExactSchemaProfileMatch = ({
	fingerprint,
	profiles,
}: {
	readonly fingerprint: SchemaFingerprint;
	readonly profiles: readonly SchemaProfile[];
}): ExactSchemaProfileMatch | null => {
	const normalizedFingerprint = normalizeFingerprint(fingerprint);
	if (!normalizedFingerprint) {
		return null;
	}

	const matches = profiles
		.filter(profile =>
			isProfileEligible(profile) &&
			normalizeFingerprint(profile.schemaFingerprint) === normalizedFingerprint
		)
		.sort(compareSchemaProfileMatchStrength);

	if (!matches.length) {
		return null;
	}

	return {
		profile: matches[0],
		confidence: 0.96,
		reason: "exactFingerprint",
	};
};

export const findSchemaProfileBindingForColumn = (
	profile: SchemaProfile,
	columnProfile: ColumnProfile,
): SchemaProfileBinding | null => {
	for (const binding of profile.bindings) {
		const selector = binding.selector;
		const hasColumnIndex = isNonNegativeInteger(selector.columnIndex);
		const hasNormalizedHeader = normalizeHeader(selector.normalizedHeader) !== "";
		if (!hasColumnIndex && !hasNormalizedHeader) {
			continue;
		}
		if (hasColumnIndex && selector.columnIndex !== columnProfile.rawCol) {
			continue;
		}
		if (
			hasNormalizedHeader &&
			normalizeHeader(selector.normalizedHeader) !== normalizeHeader(columnProfile.normalizedHeader)
		) {
			continue;
		}
		return binding;
	}

	return null;
};

const isProfileEligible = (
	profile: SchemaProfile,
): boolean =>
	profile.confirmedCount > 0 &&
	profile.conflictCount === 0 &&
	profile.bindings.length > 0;

const compareSchemaProfileMatchStrength = (
	a: SchemaProfile,
	b: SchemaProfile,
): number =>
	b.confirmedCount - a.confirmedCount ||
	b.bindings.length - a.bindings.length ||
	String(a.id ?? "").localeCompare(String(b.id ?? ""));

const normalizeFingerprint = (
	value: unknown,
): string =>
	String(value ?? "").trim();

const normalizeHeader = (
	value: unknown,
): string =>
	normalizeCellText(value)
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();

const isNonNegativeInteger = (
	value: unknown,
): value is number =>
	Number.isInteger(value) && Number(value) >= 0;
