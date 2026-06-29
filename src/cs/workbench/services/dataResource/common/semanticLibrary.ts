/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "src/cs/base/common/objects";
import semanticLibraryJson from "../../../../../../resources/recipes/v1/semantic-library.json";
import type {
	StructuredAxisTendency,
	StructuredCanonicalUnit,
	StructuredIvSweepMode,
	StructuredMeasurementColumnRole,
	StructuredMeasurementFamily,
} from "./structuredContent";

export type DataResourceSemanticTitleMatch = {
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly normalizedTitle: string;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type DataResourceRowMarkerKind = "titleRow" | "dataRow";

type SemanticTitleRecord = {
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly aliases: readonly string[];
};

type SemanticRowMarkerRecord = {
	readonly kind: DataResourceRowMarkerKind;
	readonly aliases: readonly string[];
};

type SemanticLibrary = {
	readonly schemaVersion: 1;
	readonly rowMarkers: readonly SemanticRowMarkerRecord[];
	readonly titles: readonly SemanticTitleRecord[];
};

const semanticLibrary = semanticLibraryJson as SemanticLibrary;

const titleByAlias = new Map<string, SemanticTitleRecord>();
const rowMarkerByAlias = new Map<string, DataResourceRowMarkerKind>();

for (const title of semanticLibrary.titles) {
	for (const alias of title.aliases) {
		titleByAlias.set(normalizeSemanticLookupText(alias), title);
	}
}

for (const marker of semanticLibrary.rowMarkers) {
	for (const alias of marker.aliases) {
		rowMarkerByAlias.set(normalizeSemanticLookupText(alias), marker.kind);
	}
}

export const dataResourceSemanticLibraryFingerprint = `data-resource-semantic:${hashString(stableStringify(semanticLibrary))}`;

export const matchDataResourceSemanticTitle = (
	value: unknown,
): DataResourceSemanticTitleMatch | null => {
	const rawText = normalizeText(value);
	if (!rawText) {
		return null;
	}

	const axisMarker = readAxisMarker(rawText);
	const titleWithoutAxisMarker = stripAxisMarker(rawText);
	const normalizedTitle = normalizeSemanticLookupText(titleWithoutAxisMarker);
	const normalizedTitleTokens = normalizeSemanticLookupTokens(titleWithoutAxisMarker);
	const matches: Array<{
		readonly aliasLength: number;
		readonly reason: string;
		readonly title: SemanticTitleRecord;
	}> = [];

	const direct = titleByAlias.get(normalizedTitle);
	if (direct) {
		matches.push({
			aliasLength: normalizedTitle.length,
			reason: "semanticLibrary.alias",
			title: direct,
		});
	}

	for (const [alias, title] of titleByAlias) {
		if (alias.length <= 1) {
			continue;
		}
		const tokenMatched = normalizedTitleTokens.includes(alias);
		const containedMatched = alias.length >= 4 && normalizedTitle.includes(alias);
		if (tokenMatched || containedMatched) {
			matches.push({
				aliasLength: alias.length,
				reason: tokenMatched ? "semanticLibrary.tokenAlias" : "semanticLibrary.containsAlias",
				title,
			});
		}
	}

	const selected = matches
		.sort((left, right) =>
			getAxisMatchRank(right.title, axisMarker) - getAxisMatchRank(left.title, axisMarker) ||
			right.aliasLength - left.aliasLength
		)[0];
	return selected
		? createSemanticTitleMatch(selected.title, normalizedTitle, axisMarker, selected.reason)
		: null;
};

export const matchDataResourceRowMarker = (
	value: unknown,
): DataResourceRowMarkerKind | null =>
	rowMarkerByAlias.get(normalizeSemanticLookupText(value)) ?? null;

export const normalizeDataResourceSemanticText = (
	value: unknown,
): string => normalizeSemanticLookupText(value);

const createSemanticTitleMatch = (
	title: SemanticTitleRecord,
	normalizedTitle: string,
	axisMarker: StructuredAxisTendency | null,
	reason: string,
): DataResourceSemanticTitleMatch => {
	const axisTendency = axisMarker ?? title.axisTendency;
	const confidence = clampConfidence(title.axisTendency === axisTendency ? 0.95 : 0.88);
	return {
		canonicalRole: title.canonicalRole,
		...(title.canonicalUnit ? { canonicalUnit: title.canonicalUnit } : {}),
		axisTendency,
		...(title.family ? { family: title.family } : {}),
		...(title.ivMode ? { ivMode: title.ivMode } : {}),
		normalizedTitle,
		confidence,
		reasons: axisMarker
			? [reason, `semanticLibrary.axisMarker:${axisMarker}`]
			: [reason],
	};
};

const getAxisMatchRank = (
	title: SemanticTitleRecord,
	axisMarker: StructuredAxisTendency | null,
): number => !axisMarker || title.axisTendency === axisMarker ? 1 : 0;

const readAxisMarker = (
	value: string,
): StructuredAxisTendency | null => {
	const normalized = value.trim().toLowerCase();
	if (/(^|[\s_\-()])x\s*$/.test(normalized)) {
		return "x";
	}
	if (/(^|[\s_\-()])y\s*$/.test(normalized)) {
		return "dependent";
	}
	return null;
};

const stripAxisMarker = (
	value: string,
): string => value.replace(/(^|[\s_\-()])[xy]\s*$/i, " ");

function normalizeSemanticLookupText(
	value: unknown,
): string {
	return normalizeText(value)
		.replace(/\u00b5|\u03bc/g, "u")
		.replace(/\u03a9|\u03c9|\u2126/g, "ohm")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function normalizeSemanticLookupTokens(
	value: unknown,
): readonly string[] {
	return normalizeText(value)
		.replace(/\u00b5|\u03bc/g, "u")
		.replace(/\u03a9|\u03c9|\u2126/g, "ohm")
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.map(token => token.trim())
		.filter(Boolean);
}

function normalizeText(
	value: unknown,
): string {
	return String(value ?? "").trim();
}

const clampConfidence = (
	value: number,
): number => Math.max(0, Math.min(1, value));

function hashString(
	value: string,
): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0).toString(36);
}
