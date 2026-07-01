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
import type {
	TemplateSemanticTermRule,
	TemplateXAxisIntent,
} from "src/cs/workbench/services/settings/common/settings";

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

export type DataResourceBuiltinSemanticTerm = {
	readonly id: string;
	readonly alias: string;
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly domainPackIds: readonly string[];
};

export type DataResourceBuiltinSemanticDomainPack = {
	readonly id: string;
	readonly label: string;
	readonly kind: "core" | "domain" | "format" | "test";
	readonly description: string;
	readonly rolePriors: readonly string[];
	readonly intentPriors: readonly TemplateXAxisIntent[];
	readonly xRolePriorityByIntent: Readonly<Record<string, readonly string[]>>;
	readonly patterns: readonly string[];
};

type SemanticTitleRecord = {
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly domainPackIds?: readonly string[];
	readonly aliases: readonly string[];
};

type SemanticRowMarkerRecord = {
	readonly kind: DataResourceRowMarkerKind;
	readonly domainPackIds?: readonly string[];
	readonly aliases: readonly string[];
};

type SemanticLibrary = {
	readonly schemaVersion: 1;
	readonly domainPacks: readonly DataResourceBuiltinSemanticDomainPack[];
	readonly rowMarkers: readonly SemanticRowMarkerRecord[];
	readonly titles: readonly SemanticTitleRecord[];
};

const semanticLibrary = semanticLibraryJson as unknown as SemanticLibrary;

type SemanticTitleLookupSource = "library" | "allowlist";

type SemanticTitleLookupEntry = {
	readonly id?: string;
	readonly alias: string;
	readonly title: SemanticTitleRecord;
	readonly source: SemanticTitleLookupSource;
	readonly intent?: TemplateXAxisIntent;
	readonly domainPackIds: readonly string[];
};

type SemanticRowMarkerLookupEntry = {
	readonly alias: string;
	readonly kind: DataResourceRowMarkerKind;
	readonly domainPackIds: readonly string[];
};

type SemanticTitleMatchCandidate = {
	readonly aliasLength: number;
	readonly reason: string;
	readonly sourceRank: number;
	readonly entry: SemanticTitleLookupEntry;
};

export type DataResourceSemanticMatcherOptions = {
	readonly allowlist?: readonly TemplateSemanticTermRule[];
	readonly disabledBuiltinTermIds?: readonly string[];
	readonly disabledDomainPackIds?: readonly string[];
	readonly xAxisIntentPriority?: readonly TemplateXAxisIntent[];
};

export type DataResourceSemanticMatcher = {
	readonly fingerprint: string;
	readonly matchTitle: (value: unknown) => DataResourceSemanticTitleMatch | null;
	readonly matchRowMarker: (value: unknown) => DataResourceRowMarkerKind | null;
	readonly normalizeText: (value: unknown) => string;
	readonly xAxisIntentPriority: readonly TemplateXAxisIntent[];
};

const builtinTitleEntries: SemanticTitleLookupEntry[] = [];
const builtinSemanticTerms: DataResourceBuiltinSemanticTerm[] = [];
const builtinRowMarkerEntries: SemanticRowMarkerLookupEntry[] = [];

for (const title of semanticLibrary.titles) {
	for (const alias of title.aliases) {
		if (!isDataResourceBuiltinSemanticMatchTermAllowed(alias)) {
			continue;
		}
		const id = createBuiltinTermId(title, alias);
		builtinTitleEntries.push({
			id,
			alias: normalizeSemanticLookupText(alias),
			title,
			source: "library",
			domainPackIds: title.domainPackIds ?? [],
		});
		builtinSemanticTerms.push({
			id,
			alias,
			canonicalRole: title.canonicalRole,
			...(title.canonicalUnit ? { canonicalUnit: title.canonicalUnit } : {}),
			axisTendency: title.axisTendency,
			...(title.family ? { family: title.family } : {}),
			...(title.ivMode ? { ivMode: title.ivMode } : {}),
			domainPackIds: title.domainPackIds ?? [],
		});
	}
}

for (const marker of semanticLibrary.rowMarkers) {
	for (const alias of marker.aliases) {
		builtinRowMarkerEntries.push({
			alias: normalizeSemanticLookupText(alias),
			kind: marker.kind,
			domainPackIds: marker.domainPackIds ?? [],
		});
	}
}

const defaultSemanticMatcher = createDataResourceSemanticMatcher();

export const dataResourceSemanticLibraryFingerprint = defaultSemanticMatcher.fingerprint;
export const dataResourceBuiltinSemanticTerms: readonly DataResourceBuiltinSemanticTerm[] = Object.freeze(builtinSemanticTerms.slice());
export const dataResourceBuiltinSemanticDomainPacks: readonly DataResourceBuiltinSemanticDomainPack[] = Object.freeze(semanticLibrary.domainPacks.slice());

export function createDataResourceSemanticMatcher(
	options: DataResourceSemanticMatcherOptions = {},
): DataResourceSemanticMatcher {
	const allowlist = normalizeAllowlistEntries(options.allowlist ?? []);
	const disabledBuiltinTermIds = new Set((options.disabledBuiltinTermIds ?? []).filter(Boolean));
	const disabledDomainPackIds = new Set((options.disabledDomainPackIds ?? []).filter(Boolean));
	const xAxisIntentPriority = Array.isArray(options.xAxisIntentPriority)
		? options.xAxisIntentPriority.slice()
		: [];
	const titleEntries = [
		...builtinTitleEntries.filter(entry =>
			(!entry.id || !disabledBuiltinTermIds.has(entry.id)) &&
			hasActiveDomainPack(entry.domainPackIds, disabledDomainPackIds)
		),
		...allowlist,
	];
	const rowMarkerEntries = builtinRowMarkerEntries.filter(entry =>
		hasActiveDomainPack(entry.domainPackIds, disabledDomainPackIds)
	);
	const fingerprint = `data-resource-semantic:${hashString(stableStringify({
		allowlist: allowlist.map(entry => ({
			alias: entry.alias,
			title: entry.title,
			intent: entry.intent,
		})),
		disabledBuiltinTermIds: Array.from(disabledBuiltinTermIds).sort(),
		disabledDomainPackIds: Array.from(disabledDomainPackIds).sort(),
		library: semanticLibrary,
		xAxisIntentPriority,
	}))}`;
	return {
		fingerprint,
		matchTitle: value => matchSemanticTitle(value, titleEntries),
		matchRowMarker: value => matchSemanticRowMarker(value, rowMarkerEntries),
		normalizeText: normalizeSemanticLookupText,
		xAxisIntentPriority,
	};
}

export const matchDataResourceSemanticTitle = (
	value: unknown,
): DataResourceSemanticTitleMatch | null => defaultSemanticMatcher.matchTitle(value);

export const matchDataResourceRowMarker = (
	value: unknown,
): DataResourceRowMarkerKind | null => defaultSemanticMatcher.matchRowMarker(value);

export const normalizeDataResourceSemanticText = (
	value: unknown,
): string => defaultSemanticMatcher.normalizeText(value);

export function isDataResourceBuiltinSemanticMatchTermAllowed(value: unknown): boolean {
	return normalizeSemanticLookupText(value).length > 1;
}

export function isDataResourceCustomSemanticMatchTermAllowed(value: unknown): boolean {
	return normalizeSemanticLookupText(value).length > 0;
}

const matchSemanticTitle = (
	value: unknown,
	titleEntries: readonly SemanticTitleLookupEntry[],
): DataResourceSemanticTitleMatch | null => {
	const rawText = normalizeText(value);
	if (!rawText) {
		return null;
	}

	const axisMarker = readAxisMarker(rawText);
	const titleWithoutAxisMarker = stripAxisMarker(rawText);
	const normalizedTitle = normalizeSemanticLookupText(titleWithoutAxisMarker);
	const matches: SemanticTitleMatchCandidate[] = [];

	for (const entry of titleEntries) {
		if (!entry.alias) {
			continue;
		}
		if (normalizedTitle === entry.alias) {
			matches.push({
				aliasLength: entry.alias.length,
				reason: entry.source === "allowlist" ? "semanticAllowlist.term" : "semanticLibrary.term",
				sourceRank: entry.source === "allowlist" ? 1 : 0,
				entry,
			});
			continue;
		}
	}

	const selected = matches
		.sort((left, right) =>
			getAxisMatchRank(right.entry.title, axisMarker) - getAxisMatchRank(left.entry.title, axisMarker) ||
			right.sourceRank - left.sourceRank ||
			right.aliasLength - left.aliasLength
		)[0];
	return selected
		? createSemanticTitleMatch(selected.entry, normalizedTitle, axisMarker, selected.reason)
		: null;
};

const matchSemanticRowMarker = (
	value: unknown,
	rowMarkerEntries: readonly SemanticRowMarkerLookupEntry[],
): DataResourceRowMarkerKind | null => {
	const normalized = normalizeSemanticLookupText(value);
	if (!normalized) {
		return null;
	}
	return rowMarkerEntries.find(entry => entry.alias === normalized)?.kind ?? null;
};

const createSemanticTitleMatch = (
	entry: SemanticTitleLookupEntry,
	normalizedTitle: string,
	axisMarker: StructuredAxisTendency | null,
	reason: string,
): DataResourceSemanticTitleMatch => {
	const title = entry.title;
	const axisTendency = axisMarker ?? title.axisTendency;
	const baseConfidence = entry.source === "allowlist" ? 0.97 : 0.95;
	const confidence = clampConfidence(title.axisTendency === axisTendency ? baseConfidence : baseConfidence - 0.07);
	const reasons = axisMarker
		? [reason, `semanticLibrary.axisMarker:${axisMarker}`]
		: [reason];
	if (entry.intent) {
		reasons.push(`semanticAllowlist.intent:${entry.intent}`);
	}
	return {
		canonicalRole: title.canonicalRole,
		...(title.canonicalUnit ? { canonicalUnit: title.canonicalUnit } : {}),
		axisTendency,
		...(title.family ? { family: title.family } : {}),
		...(title.ivMode ? { ivMode: title.ivMode } : {}),
		normalizedTitle,
		confidence,
		reasons,
	};
};

function normalizeAllowlistEntries(
	allowlist: readonly TemplateSemanticTermRule[],
): readonly SemanticTitleLookupEntry[] {
	return allowlist
		.filter(rule => rule.enabled !== false && isDataResourceCustomSemanticMatchTermAllowed(rule.alias))
		.map(rule => ({
			id: rule.id,
			alias: normalizeSemanticLookupText(rule.alias),
			title: {
				canonicalRole: rule.canonicalRole as StructuredMeasurementColumnRole,
				...(rule.canonicalUnit ? { canonicalUnit: rule.canonicalUnit as StructuredCanonicalUnit } : {}),
				axisTendency: rule.axisTendency as StructuredAxisTendency,
				...(rule.family ? { family: rule.family as StructuredMeasurementFamily } : {}),
				...(rule.ivMode ? { ivMode: rule.ivMode as StructuredIvSweepMode } : {}),
				aliases: [rule.alias],
			},
			source: "allowlist",
			...(rule.intent ? { intent: rule.intent } : {}),
			domainPackIds: [],
		}));
}

function hasActiveDomainPack(
	domainPackIds: readonly string[],
	disabledDomainPackIds: ReadonlySet<string>,
): boolean {
	return domainPackIds.length === 0 || domainPackIds.some(id => !disabledDomainPackIds.has(id));
}

function createBuiltinTermId(
	title: SemanticTitleRecord,
	alias: string,
): string {
	return [
		"builtin",
		title.canonicalRole,
		title.axisTendency,
		normalizeSemanticLookupText(alias),
	].join(":");
}

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
