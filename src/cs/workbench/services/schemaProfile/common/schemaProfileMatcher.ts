/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { normalizeCellText } from "src/cs/workbench/common/cellText";
import type {
	StructuredCanonicalUnit,
	StructuredColumnProfile,
	StructuredMeasurementColumnRef,
	StructuredSchemaFingerprint,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type {
	SchemaProfile,
	SchemaProfileBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export type ExactSchemaProfileMatch = {
	readonly kind: "exact";
	readonly profile: SchemaProfile;
	readonly confidence: number;
	readonly reason: "exactFingerprint";
};

export type SimilarSchemaProfileMatch = {
	readonly kind: "similar";
	readonly profile: SchemaProfile;
	readonly confidence: number;
	readonly reason: "schemaProfile.similarSchema";
	readonly bindingCoverage: number;
	readonly scores: {
		readonly headerOverlap: number;
		readonly columnCompatibility: number;
		readonly roleUnitOverlap: number;
	};
};

export type SchemaProfileMatch =
	| ExactSchemaProfileMatch
	| SimilarSchemaProfileMatch;

export const findExactSchemaProfileMatch = ({
	fingerprint,
	profiles,
}: {
	readonly fingerprint: StructuredSchemaFingerprint;
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
		kind: "exact",
		profile: matches[0],
		confidence: 0.96,
		reason: "exactFingerprint",
	};
};

export const findSimilarSchemaProfileMatch = ({
	columnProfiles,
	measurementColumns = [],
	minConfidence = 0.55,
	profiles,
}: {
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly measurementColumns?: readonly StructuredMeasurementColumnRef[];
	readonly minConfidence?: number;
	readonly profiles: readonly SchemaProfile[];
}): SimilarSchemaProfileMatch | null => {
	if (!columnProfiles.length) {
		return null;
	}

	const matches = profiles
		.filter(isProfileEligible)
		.map(profile => createSimilarSchemaProfileMatch({
			columnProfiles,
			measurementColumns,
			profile,
		}))
		.filter((match): match is SimilarSchemaProfileMatch =>
			match !== null && match.confidence >= minConfidence
		)
		.sort(compareSimilarSchemaProfileMatches);

	return matches[0] ?? null;
};

export const findSchemaProfileBindingForColumn = (
	profile: SchemaProfile,
	columnProfile: StructuredColumnProfile,
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

const createSimilarSchemaProfileMatch = ({
	columnProfiles,
	measurementColumns,
	profile,
}: {
	readonly columnProfiles: readonly StructuredColumnProfile[];
	readonly measurementColumns: readonly StructuredMeasurementColumnRef[];
	readonly profile: SchemaProfile;
}): SimilarSchemaProfileMatch | null => {
	const bindings = profile.bindings.filter(binding =>
		isNonNegativeInteger(binding.selector.columnIndex) ||
		normalizeHeader(binding.selector.normalizedHeader) !== ""
	);
	if (!bindings.length) {
		return null;
	}

	const headers = new Set(columnProfiles.map(profile => normalizeHeader(profile.normalizedHeader)));
	const measurementColumnsByRawCol = createMeasurementColumnsByRawCol(measurementColumns);
	const measurementColumnsByHeader = createMeasurementColumnsByHeader(measurementColumns);
	let headerComparableCount = 0;
	let headerMatchedCount = 0;
	let columnCompatibleCount = 0;
	let bindingMatchedCount = 0;
	let roleUnitComparableCount = 0;
	let roleUnitScore = 0;

	for (const binding of bindings) {
		const normalizedHeader = normalizeHeader(binding.selector.normalizedHeader);
		const hasHeader = normalizedHeader !== "";
		const hasCompatibleColumn =
			isNonNegativeInteger(binding.selector.columnIndex) &&
			binding.selector.columnIndex < columnProfiles.length;
		const hasMatchingHeader = hasHeader && headers.has(normalizedHeader);

		if (hasHeader) {
			headerComparableCount += 1;
			if (hasMatchingHeader) {
				headerMatchedCount += 1;
			}
		}
		if (hasCompatibleColumn) {
			columnCompatibleCount += 1;
		}
		if (hasMatchingHeader || hasCompatibleColumn) {
			bindingMatchedCount += 1;
		}

		const measurementColumn = (
			hasHeader
				? measurementColumnsByHeader.get(normalizedHeader)
				: undefined
		) ?? (
			isNonNegativeInteger(binding.selector.columnIndex)
				? measurementColumnsByRawCol.get(binding.selector.columnIndex)
				: undefined
		);
		if (measurementColumn) {
			roleUnitComparableCount += 1;
			const roleScore = measurementColumn.role === binding.role ? 1 : 0;
			const unitScore = isCanonicalUnitCompatible(binding.canonicalUnit, measurementColumn.unit) ? 1 : 0;
			roleUnitScore += (roleScore + unitScore) / 2;
		}
	}

	const headerOverlap = headerComparableCount
		? headerMatchedCount / headerComparableCount
		: 0;
	const columnCompatibility = columnCompatibleCount / bindings.length;
	const bindingCoverage = bindingMatchedCount / bindings.length;
	const roleUnitOverlap = roleUnitComparableCount
		? roleUnitScore / roleUnitComparableCount
		: 0;
	const confidence = clampConfidence(
		0.35 * headerOverlap +
		0.20 * columnCompatibility +
		0.25 * bindingCoverage +
		0.20 * roleUnitOverlap,
	);

	return bindingCoverage > 0
		? {
			kind: "similar",
			profile,
			confidence,
			reason: "schemaProfile.similarSchema",
			bindingCoverage,
			scores: {
				headerOverlap,
				columnCompatibility,
				roleUnitOverlap,
			},
		}
		: null;
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

const compareSimilarSchemaProfileMatches = (
	a: SimilarSchemaProfileMatch,
	b: SimilarSchemaProfileMatch,
): number =>
	b.confidence - a.confidence ||
	b.bindingCoverage - a.bindingCoverage ||
	compareSchemaProfileMatchStrength(a.profile, b.profile);

const createMeasurementColumnsByRawCol = (
	columns: readonly StructuredMeasurementColumnRef[],
): ReadonlyMap<number, StructuredMeasurementColumnRef> => {
	const result = new Map<number, StructuredMeasurementColumnRef>();
	for (const column of columns) {
		if (isNonNegativeInteger(column.rawCol)) {
			result.set(column.rawCol, column);
		}
	}
	return result;
};

const createMeasurementColumnsByHeader = (
	columns: readonly StructuredMeasurementColumnRef[],
): ReadonlyMap<string, StructuredMeasurementColumnRef> => {
	const result = new Map<string, StructuredMeasurementColumnRef>();
	for (const column of columns) {
		const header = normalizeHeader(column.headerText);
		if (header) {
			result.set(header, column);
		}
	}
	return result;
};

const isCanonicalUnitCompatible = (
	expected: StructuredCanonicalUnit | null | undefined,
	actual: string | null | undefined,
): boolean =>
	!expected || !actual || expected === normalizeCanonicalUnit(actual);

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

const clampConfidence = (
	value: number,
): number =>
	Math.max(0, Math.min(1, value));

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
