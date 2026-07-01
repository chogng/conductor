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

type SemanticTitleTerm = {
	readonly id?: string;
	readonly key: string;
	readonly aliases: readonly string[];
	readonly title: SemanticTitleRecord;
	readonly source: SemanticTitleLookupSource;
	readonly intent?: TemplateXAxisIntent;
	readonly domainPackIds: readonly string[];
};

type SemanticRowMarkerTerm = {
	readonly key: string;
	readonly aliases: readonly string[];
	readonly kind: SemanticRowMarkerKind;
	readonly domainPackIds: readonly string[];
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
	readonly toKey: (value: unknown) => string;
	readonly xAxisIntentPriority: readonly TemplateXAxisIntent[];
};

//#endregion

//#region Built-in recipe indexes
// Precomputed library indexes keep matcher construction cheap for each settings snapshot.

const builtinTitleTermsByKey = new Map<string, SemanticTitleTerm>();
const builtinSemanticTermRecords: BuiltinSemanticTerm[] = [];
const builtinRowMarkerTermsByKey = new Map<string, SemanticRowMarkerTerm>();

for (const title of semanticLibrary.titles) {
	for (const alias of title.aliases) {
		if (!isBuiltinSemanticMatchTermAllowed(alias)) {
			continue;
		}
		const key = toSemanticTermKey(alias);
		const id = createBuiltinTermId(title, key);
		addSemanticTitleTerm(builtinTitleTermsByKey, {
			id,
			key,
			aliases: [alias],
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
		const key = toSemanticTermKey(alias);
		if (!key) {
			continue;
		}
		addSemanticRowMarkerTerm(builtinRowMarkerTermsByKey, {
			key,
			aliases: [alias],
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
	const allowlist = compileAllowlistTitleTerms(options.allowlist ?? []);
	const disabledBuiltinTermIds = new Set((options.disabledBuiltinTermIds ?? []).filter(Boolean));
	const disabledDomainPackIds = new Set((options.disabledDomainPackIds ?? []).filter(Boolean));
	const xAxisIntentPriority = Array.isArray(options.xAxisIntentPriority)
		? options.xAxisIntentPriority.slice()
		: [];
	const titleTerms = compileSemanticTitleTerms([
		...Array.from(builtinTitleTermsByKey.values()).filter(term =>
			(!term.id || !disabledBuiltinTermIds.has(term.id)) &&
			hasActiveDomainPack(term.domainPackIds, disabledDomainPackIds)
		),
		...allowlist,
	]);
	const titleTermsByKey = new Map(titleTerms.map(term => [term.key, term]));
	const rowMarkerTerms = Array.from(builtinRowMarkerTermsByKey.values()).filter(term =>
		hasActiveDomainPack(term.domainPackIds, disabledDomainPackIds)
	);
	const rowMarkerTermsByKey = new Map(rowMarkerTerms.map(term => [term.key, term]));
	const fingerprint = `data-resource-semantic:${hashString(stableStringify({
		titleTerms: titleTerms.map(term => ({
			key: term.key,
			title: term.title,
			intent: term.intent,
			source: term.source,
		})),
		disabledBuiltinTermIds: Array.from(disabledBuiltinTermIds).sort(),
		disabledDomainPackIds: Array.from(disabledDomainPackIds).sort(),
		rowMarkerTerms: rowMarkerTerms.map(term => ({
			key: term.key,
			kind: term.kind,
		})),
		xAxisIntentPriority,
	}))}`;
	return {
		fingerprint,
		matchTitle: value => matchSemanticTitleFromTerms(value, titleTermsByKey),
		matchRowMarker: value => matchSemanticRowMarkerFromTerms(value, rowMarkerTermsByKey),
		toKey: toSemanticTermKey,
		xAxisIntentPriority,
	};
}

export const matchSemanticTitle = (
	value: unknown,
): SemanticTitleMatch | null => defaultSemanticMatcher.matchTitle(value);

export const matchSemanticRowMarker = (
	value: unknown,
): SemanticRowMarkerKind | null => defaultSemanticMatcher.matchRowMarker(value);

export function toSemanticTermKey(
	value: unknown,
): string {
	return normalizeText(value)
		.replace(/\u00b5|\u03bc/g, "u")
		.replace(/\u03a9|\u03c9|\u2126/g, "ohm")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");
}

export function isBuiltinSemanticMatchTermAllowed(value: unknown): boolean {
	return toSemanticTermKey(value).length > 1;
}

export function isCustomSemanticMatchTermAllowed(value: unknown): boolean {
	return toSemanticTermKey(value).length > 1;
}

//#endregion

//#region Title and row-marker matching
// Match header keys against built-in recipe terms and user allowlist entries.

const matchSemanticTitleFromTerms = (
	value: unknown,
	titleTermsByKey: ReadonlyMap<string, SemanticTitleTerm>,
): SemanticTitleMatch | null => {
	const rawText = normalizeText(value);
	if (!rawText) {
		return null;
	}

	const axisMarker = readAxisMarker(rawText);
	const titleWithoutAxisMarker = stripAxisMarker(rawText);
	const key = toSemanticTermKey(titleWithoutAxisMarker);
	const term = titleTermsByKey.get(key);
	return term
		? createSemanticTitleMatch(term, key, axisMarker, term.source === "allowlist" ? "semanticAllowlist.term" : "semanticLibrary.term")
		: null;
};

const matchSemanticRowMarkerFromTerms = (
	value: unknown,
	rowMarkerTermsByKey: ReadonlyMap<string, SemanticRowMarkerTerm>,
): SemanticRowMarkerKind | null => {
	const key = toSemanticTermKey(value);
	if (!key) {
		return null;
	}
	return rowMarkerTermsByKey.get(key)?.kind ?? null;
};

const createSemanticTitleMatch = (
	term: SemanticTitleTerm,
	key: string,
	axisMarker: StructuredAxisTendency | null,
	reason: string,
): SemanticTitleMatch => {
	const title = term.title;
	const axisTendency = axisMarker ?? title.axisTendency;
	const baseConfidence = term.source === "allowlist" ? 0.97 : 0.95;
	const confidence = clampConfidence(title.axisTendency === axisTendency ? baseConfidence : baseConfidence - 0.07);
	const reasons = axisMarker
		? [reason, `semanticLibrary.axisMarker:${axisMarker}`]
		: [reason];
	if (term.intent) {
		reasons.push(`semanticAllowlist.intent:${term.intent}`);
	}
	return {
		canonicalRole: title.canonicalRole,
		...(title.canonicalUnit ? { canonicalUnit: title.canonicalUnit } : {}),
		axisTendency,
		...(title.family ? { family: title.family } : {}),
		...(title.ivMode ? { ivMode: title.ivMode } : {}),
		normalizedTitle: key,
		confidence,
		reasons,
	};
};

//#endregion

//#region Allowlist and domain-pack filtering
// Compile raw aliases into key-owned matcher terms and remove disabled recipe domains.

function compileAllowlistTitleTerms(
	allowlist: readonly TemplateSemanticTermRule[],
): readonly SemanticTitleTerm[] {
	const termsByKey = new Map<string, SemanticTitleTerm>();
	for (const rule of allowlist) {
		if (rule.enabled === false || !isCustomSemanticMatchTermAllowed(rule.alias)) {
			continue;
		}
		const key = toSemanticTermKey(rule.alias);
		addSemanticTitleTerm(termsByKey, {
			id: rule.id,
			key,
			aliases: [rule.alias],
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
		});
	}
	return Array.from(termsByKey.values());
}

function compileSemanticTitleTerms(
	terms: readonly SemanticTitleTerm[],
): readonly SemanticTitleTerm[] {
	const termsByKey = new Map<string, SemanticTitleTerm>();
	for (const term of terms) {
		addSemanticTitleTerm(termsByKey, term);
	}
	return Array.from(termsByKey.values());
}

function addSemanticTitleTerm(
	termsByKey: Map<string, SemanticTitleTerm>,
	term: SemanticTitleTerm,
): void {
	if (!term.key) {
		return;
	}
	const current = termsByKey.get(term.key);
	if (!current) {
		termsByKey.set(term.key, term);
		return;
	}
	termsByKey.set(term.key, {
		...current,
		aliases: mergeUniqueValues(current.aliases, term.aliases),
	});
}

function addSemanticRowMarkerTerm(
	termsByKey: Map<string, SemanticRowMarkerTerm>,
	term: SemanticRowMarkerTerm,
): void {
	if (!term.key) {
		return;
	}
	const current = termsByKey.get(term.key);
	if (!current) {
		termsByKey.set(term.key, term);
		return;
	}
	termsByKey.set(term.key, {
		...current,
		aliases: mergeUniqueValues(current.aliases, term.aliases),
	});
}

function mergeUniqueValues(
	current: readonly string[],
	next: readonly string[],
): readonly string[] {
	const values = current.slice();
	const seen = new Set(values);
	for (const value of next) {
		if (!seen.has(value)) {
			values.push(value);
			seen.add(value);
		}
	}
	return values;
}

function hasActiveDomainPack(
	domainPackIds: readonly string[],
	disabledDomainPackIds: ReadonlySet<string>,
): boolean {
	return domainPackIds.length === 0 || domainPackIds.some(id => !disabledDomainPackIds.has(id));
}

function createBuiltinTermId(
	title: SemanticTitleRecord,
	key: string,
): string {
	return [
		"builtin",
		title.canonicalRole,
		title.axisTendency,
		key,
	].join(":");
}

//#endregion

//#region Axis-marker handling
// Optional trailing X/Y markers refine the semantic axis without changing the term.

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
// Shared key generation defines which match-term text is valid and comparable.

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
