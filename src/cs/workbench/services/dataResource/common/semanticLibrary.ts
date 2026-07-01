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

//#region Public semantic contracts
// Stable values consumed by DataResource evidence, Settings UI, and Review callers.

export type SemanticTitleMatch = {
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly normalizedTitle: string;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type SemanticRowMarkerKind = "titleRow" | "dataRow";

export type BuiltinSemanticTerm = {
	readonly id: string;
	readonly alias: string;
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly domainPackIds: readonly string[];
};

export type BuiltinSemanticDomainPack = {
	readonly id: string;
	readonly label: string;
	readonly kind: "core" | "domain" | "format" | "test";
	readonly description: string;
	readonly rolePriors: readonly string[];
	readonly intentPriors: readonly TemplateXAxisIntent[];
	readonly xRolePriorityByIntent: Readonly<Record<string, readonly string[]>>;
	readonly patterns: readonly string[];
};

//#endregion

//#region Recipe schema and lookup records
// Internal shapes for the bundled semantic recipe plus normalized lookup entries.

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
	readonly kind: SemanticRowMarkerKind;
	readonly domainPackIds?: readonly string[];
	readonly aliases: readonly string[];
};

type SemanticLibrary = {
	readonly schemaVersion: 1;
	readonly domainPacks: readonly BuiltinSemanticDomainPack[];
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
	readonly kind: SemanticRowMarkerKind;
	readonly domainPackIds: readonly string[];
};

type SemanticTitleMatchCandidate = {
	readonly aliasLength: number;
	readonly reason: string;
	readonly sourceRank: number;
	readonly entry: SemanticTitleLookupEntry;
};

//#endregion

//#region Matcher options and instance contract
// Settings-derived options select active built-ins and add user-defined terms.

export type SemanticMatcherOptions = {
	readonly allowlist?: readonly TemplateSemanticTermRule[];
	readonly disabledBuiltinTermIds?: readonly string[];
	readonly disabledDomainPackIds?: readonly string[];
	readonly xAxisIntentPriority?: readonly TemplateXAxisIntent[];
};

export type SemanticMatcher = {
	readonly fingerprint: string;
	readonly matchTitle: (value: unknown) => SemanticTitleMatch | null;
	readonly matchRowMarker: (value: unknown) => SemanticRowMarkerKind | null;
	readonly normalizeText: (value: unknown) => string;
	readonly xAxisIntentPriority: readonly TemplateXAxisIntent[];
};

//#endregion

//#region Built-in recipe indexes
// Precomputed library indexes keep matcher construction cheap for each settings snapshot.

const builtinTitleEntries: SemanticTitleLookupEntry[] = [];
const builtinSemanticTermRecords: BuiltinSemanticTerm[] = [];
const builtinRowMarkerEntries: SemanticRowMarkerLookupEntry[] = [];

for (const title of semanticLibrary.titles) {
	for (const alias of title.aliases) {
		if (!isBuiltinSemanticMatchTermAllowed(alias)) {
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
		builtinSemanticTermRecords.push({
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

const defaultSemanticMatcher = createSemanticMatcher();

//#endregion

//#region Public matcher API
// Exported entry points used by services and settings validation.

export const semanticLibraryFingerprint = defaultSemanticMatcher.fingerprint;
export const builtinSemanticTerms: readonly BuiltinSemanticTerm[] = Object.freeze(builtinSemanticTermRecords.slice());
export const builtinSemanticDomainPacks: readonly BuiltinSemanticDomainPack[] = Object.freeze(semanticLibrary.domainPacks.slice());

export function createSemanticMatcher(
	options: SemanticMatcherOptions = {},
): SemanticMatcher {
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
		matchTitle: value => matchSemanticTitleFromEntries(value, titleEntries),
		matchRowMarker: value => matchSemanticRowMarkerFromEntries(value, rowMarkerEntries),
		normalizeText: normalizeSemanticLookupText,
		xAxisIntentPriority,
	};
}

export const matchSemanticTitle = (
	value: unknown,
): SemanticTitleMatch | null => defaultSemanticMatcher.matchTitle(value);

export const matchSemanticRowMarker = (
	value: unknown,
): SemanticRowMarkerKind | null => defaultSemanticMatcher.matchRowMarker(value);

export const normalizeSemanticText = (
	value: unknown,
): string => defaultSemanticMatcher.normalizeText(value);

export function isBuiltinSemanticMatchTermAllowed(value: unknown): boolean {
	return normalizeSemanticLookupText(value).length > 1;
}

export function isCustomSemanticMatchTermAllowed(value: unknown): boolean {
	return normalizeSemanticLookupText(value).length > 1;
}

//#endregion

//#region Title and row-marker matching
// Match normalized headers against built-in recipe terms and user allowlist entries.

const matchSemanticTitleFromEntries = (
	value: unknown,
	titleEntries: readonly SemanticTitleLookupEntry[],
): SemanticTitleMatch | null => {
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

const matchSemanticRowMarkerFromEntries = (
	value: unknown,
	rowMarkerEntries: readonly SemanticRowMarkerLookupEntry[],
): SemanticRowMarkerKind | null => {
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
): SemanticTitleMatch => {
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

//#endregion

//#region Allowlist and domain-pack filtering
// Translate Settings records into matcher entries and remove disabled recipe domains.

function normalizeAllowlistEntries(
	allowlist: readonly TemplateSemanticTermRule[],
): readonly SemanticTitleLookupEntry[] {
	return allowlist
		.filter(rule => rule.enabled !== false && isCustomSemanticMatchTermAllowed(rule.alias))
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

//#endregion

//#region Axis-marker handling
// Optional trailing X/Y markers refine the semantic axis without changing the term.

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

//#endregion

//#region Text normalization and fingerprints
// Shared normalization defines which match-term text is valid and comparable.

function normalizeSemanticLookupText(
	value: unknown,
): string {
	return normalizeText(value)
		.replace(/\u00b5|\u03bc/g, "u")
		.replace(/\u03a9|\u03c9|\u2126/g, "ohm")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");
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

//#endregion
