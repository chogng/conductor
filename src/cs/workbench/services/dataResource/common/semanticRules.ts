/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "src/cs/base/common/objects";
import coreRulesJson from "../../../../../../resources/rules/v1/core.json";
import cvRulesJson from "../../../../../../resources/rules/v1/cv.json";
import frequencyRulesJson from "../../../../../../resources/rules/v1/frequency.json";
import genericRulesJson from "../../../../../../resources/rules/v1/generic.json";
import ivRulesJson from "../../../../../../resources/rules/v1/iv.json";
import pvRulesJson from "../../../../../../resources/rules/v1/pv.json";
import transientRulesJson from "../../../../../../resources/rules/v1/transient.json";
import type {
	StructuredAxisTendency,
	StructuredCanonicalUnit,
	StructuredIvSweepMode,
	StructuredMeasurementColumnRole,
	StructuredMeasurementFamily,
	StructuredXAxisIntent,
} from "./structuredContent";
import type { TemplateSemanticDomainRule } from "src/cs/workbench/services/settings/common/settings";

//#region Public semantic contracts
// Stable values consumed by DataResource evidence, Settings UI, and Review callers.

export type SemanticTitleMatch = {
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly canonicalUnit?: StructuredCanonicalUnit;
	readonly axisTendency: StructuredAxisTendency;
	readonly semanticDomains: readonly SemanticTitleDomainMatch[];
	readonly family?: StructuredMeasurementFamily;
	readonly ivMode?: StructuredIvSweepMode;
	readonly normalizedTitle: string;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type SemanticTitleDomainMatch = {
	readonly id: string;
	readonly title: string;
	readonly axisTendency: StructuredAxisTendency;
	readonly priorityIndex: number;
	readonly source: "builtin" | "user";
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

type SemanticDomainPack = {
	readonly id: string;
	readonly label: string;
	readonly kind: "core" | "domain" | "format" | "test";
	readonly description: string;
	readonly rolePriors: readonly string[];
	readonly intentPriors: readonly StructuredXAxisIntent[];
	readonly xRolePriorityByIntent: Readonly<Record<string, readonly string[]>>;
	readonly patterns: readonly string[];
};

export type BuiltinSemanticDomainRule = {
	readonly id: string;
	readonly title: string;
	readonly xTerms: readonly string[];
	readonly yTerms: readonly string[];
	readonly description: string;
};

export type SemanticDomainXPriority = {
	readonly intentPriors: readonly StructuredXAxisIntent[];
	readonly xRolePriorityByIntent: Readonly<Record<string, readonly string[]>>;
};

//#endregion

//#region Semantic rule schema and lookup records
// Internal shapes for the bundled semantic rules plus normalized lookup entries.

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

type BuiltinSemanticDomainXPriorityRecord = SemanticDomainXPriority & {
	readonly domainRuleId: string;
};

type SemanticRulesFile = {
	readonly schemaVersion: 1;
	readonly id: string;
	readonly label: string;
	readonly kind: "core" | "domain" | "format";
	readonly domainPacks?: readonly SemanticDomainPack[];
	readonly rowMarkers?: readonly SemanticRowMarkerRecord[];
	readonly titles?: readonly SemanticTitleRecord[];
	readonly domainRules?: readonly BuiltinSemanticDomainRule[];
	readonly domainXPriorities?: readonly BuiltinSemanticDomainXPriorityRecord[];
};

type SemanticRules = {
	readonly schemaVersion: 1;
	readonly domainPacks: readonly SemanticDomainPack[];
	readonly rowMarkers: readonly SemanticRowMarkerRecord[];
	readonly titles: readonly SemanticTitleRecord[];
	readonly domainRules: readonly BuiltinSemanticDomainRule[];
	readonly domainXPriorities: readonly BuiltinSemanticDomainXPriorityRecord[];
};

function compileSemanticRules(
	files: readonly SemanticRulesFile[],
): SemanticRules {
	const fileIds = new Set<string>();
	const domainRuleIds = new Set<string>();
	const domainXPriorityIds = new Set<string>();
	const titleRecordsByKey = new Map<string, { readonly fileId: string; readonly alias: string; readonly title: SemanticTitleRecord }>();
	const rowMarkerKindsByKey = new Map<string, { readonly fileId: string; readonly alias: string; readonly kind: SemanticRowMarkerKind }>();
	const domainPacks: SemanticDomainPack[] = [];
	const rowMarkers: SemanticRowMarkerRecord[] = [];
	const titles: SemanticTitleRecord[] = [];
	const domainRules: BuiltinSemanticDomainRule[] = [];
	const domainXPriorities: BuiltinSemanticDomainXPriorityRecord[] = [];
	for (const file of files) {
		if (file.schemaVersion !== 1) {
			throw new Error(`Unsupported semantic rules schema version in ${file.id}.`);
		}
		if (fileIds.has(file.id)) {
			throw new Error(`Duplicate semantic rules file id: ${file.id}`);
		}
		fileIds.add(file.id);
		domainPacks.push(...(file.domainPacks ?? []));
		for (const marker of file.rowMarkers ?? []) {
			validateSemanticRowMarkerRecord(file.id, marker, rowMarkerKindsByKey);
			rowMarkers.push(marker);
		}
		for (const title of file.titles ?? []) {
			validateSemanticTitleRecord(file.id, title, titleRecordsByKey);
			titles.push(title);
		}
		for (const rule of file.domainRules ?? []) {
			if (domainRuleIds.has(rule.id)) {
				throw new Error(`Duplicate built-in semantic domain rule id: ${rule.id}`);
			}
			validateBuiltinSemanticDomainRule(file.id, rule);
			domainRuleIds.add(rule.id);
			domainRules.push(rule);
		}
		for (const priority of file.domainXPriorities ?? []) {
			if (domainXPriorityIds.has(priority.domainRuleId)) {
				throw new Error(`Duplicate semantic domain X priority id: ${priority.domainRuleId}`);
			}
			domainXPriorityIds.add(priority.domainRuleId);
			domainXPriorities.push(priority);
		}
	}
	for (const ruleId of domainRuleIds) {
		if (!domainXPriorityIds.has(ruleId)) {
			throw new Error(`Missing semantic domain X priority for built-in rule id: ${ruleId}`);
		}
	}
	for (const priorityId of domainXPriorityIds) {
		if (!domainRuleIds.has(priorityId)) {
			throw new Error(`Semantic domain X priority references unknown built-in rule id: ${priorityId}`);
		}
	}
	return {
		schemaVersion: 1,
		domainPacks,
		rowMarkers,
		titles,
		domainRules,
		domainXPriorities,
	};
}

function validateSemanticTitleRecord(
	fileId: string,
	title: SemanticTitleRecord,
	recordsByKey: Map<string, { readonly fileId: string; readonly alias: string; readonly title: SemanticTitleRecord }>,
): void {
	for (const alias of title.aliases) {
		if (!isBuiltinSemanticMatchTermAllowed(alias)) {
			throw new Error(`Invalid semantic title alias "${alias}" in ${fileId}.`);
		}
		const key = toSemanticTermKey(alias);
		const current = recordsByKey.get(key);
		if (current && !semanticTitleRecordsCompatible(current.title, title)) {
			throw new Error(`Conflicting semantic title alias "${alias}" in ${fileId}; normalized key already belongs to "${current.alias}" in ${current.fileId}.`);
		}
		if (!current) {
			recordsByKey.set(key, { fileId, alias, title });
		}
	}
}

function semanticTitleRecordsCompatible(
	left: SemanticTitleRecord,
	right: SemanticTitleRecord,
): boolean {
	return left.canonicalRole === right.canonicalRole &&
		left.canonicalUnit === right.canonicalUnit &&
		left.axisTendency === right.axisTendency &&
		left.family === right.family &&
		left.ivMode === right.ivMode;
}

function validateSemanticRowMarkerRecord(
	fileId: string,
	marker: SemanticRowMarkerRecord,
	kindsByKey: Map<string, { readonly fileId: string; readonly alias: string; readonly kind: SemanticRowMarkerKind }>,
): void {
	for (const alias of marker.aliases) {
		const key = toSemanticTermKey(alias);
		if (!key) {
			throw new Error(`Invalid semantic row marker alias "${alias}" in ${fileId}.`);
		}
		const current = kindsByKey.get(key);
		if (current && current.kind !== marker.kind) {
			throw new Error(`Conflicting semantic row marker alias "${alias}" in ${fileId}; normalized key already belongs to "${current.alias}" in ${current.fileId}.`);
		}
		if (!current) {
			kindsByKey.set(key, { fileId, alias, kind: marker.kind });
		}
	}
}

function validateBuiltinSemanticDomainRule(
	fileId: string,
	rule: BuiltinSemanticDomainRule,
): void {
	const xKeys = validateSemanticDomainRuleTerms(fileId, rule.id, "x", rule.xTerms);
	const yKeys = validateSemanticDomainRuleTerms(fileId, rule.id, "y", rule.yTerms);
	for (const key of xKeys) {
		if (yKeys.has(key)) {
			throw new Error(`Semantic rule term "${key}" is configured as both X and Y in ${fileId}:${rule.id}.`);
		}
	}
}

function validateSemanticDomainRuleTerms(
	fileId: string,
	ruleId: string,
	axis: "x" | "y",
	terms: readonly string[],
): ReadonlySet<string> {
	const seen = new Set<string>();
	for (const term of terms) {
		if (!isCustomSemanticMatchTermAllowed(term)) {
			throw new Error(`Invalid ${axis} semantic rule term "${term}" in ${fileId}:${ruleId}.`);
		}
		const key = toSemanticTermKey(term);
		if (seen.has(key)) {
			throw new Error(`Duplicate ${axis} semantic rule term "${term}" in ${fileId}:${ruleId}.`);
		}
		seen.add(key);
	}
	return seen;
}

const semanticRuleFiles: readonly SemanticRulesFile[] = [
	ivRulesJson as unknown as SemanticRulesFile,
	cvRulesJson as unknown as SemanticRulesFile,
	frequencyRulesJson as unknown as SemanticRulesFile,
	transientRulesJson as unknown as SemanticRulesFile,
	genericRulesJson as unknown as SemanticRulesFile,
	coreRulesJson as unknown as SemanticRulesFile,
	pvRulesJson as unknown as SemanticRulesFile,
];

const semanticRules = compileSemanticRules(semanticRuleFiles);

type SemanticTitleLookupSource = "builtinRules" | "domainRule";

type SemanticTitleTerm = {
	readonly id?: string;
	readonly key: string;
	readonly aliases: readonly string[];
	readonly title: SemanticTitleRecord;
	readonly source: SemanticTitleLookupSource;
	readonly domainPackIds: readonly string[];
	readonly semanticDomains: readonly SemanticTitleDomainMatch[];
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
	readonly domainPriority?: readonly string[];
	readonly domainRules?: readonly TemplateSemanticDomainRule[];
	readonly disabledBuiltinTermIds?: readonly string[];
};

export type SemanticMatcher = {
	readonly fingerprint: string;
	readonly matchTitle: (value: unknown) => SemanticTitleMatch | null;
	readonly matchRowMarker: (value: unknown) => SemanticRowMarkerKind | null;
	readonly toKey: (value: unknown) => string;
	readonly semanticDomainPriority: readonly string[];
	readonly getDomainXPriority: (domainId: string | undefined) => SemanticDomainXPriority | null;
};

//#endregion

//#region Built-in semantic rule indexes
// Precomputed rule indexes keep matcher construction cheap for each settings snapshot.

const builtinTitleTermsByKey = new Map<string, SemanticTitleTerm>();
const builtinSemanticTermRecords: BuiltinSemanticTerm[] = [];
const builtinRowMarkerTermsByKey = new Map<string, SemanticRowMarkerTerm>();

for (const title of semanticRules.titles) {
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
			source: "builtinRules",
			domainPackIds: title.domainPackIds ?? [],
			semanticDomains: [],
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

for (const marker of semanticRules.rowMarkers) {
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

const builtinSemanticDomainRuleRecords: readonly BuiltinSemanticDomainRule[] = Object.freeze(semanticRules.domainRules.slice());
const builtinSemanticDomainXPriorityById: ReadonlyMap<string, SemanticDomainXPriority> = new Map(
	semanticRules.domainXPriorities.map(priority => [
		priority.domainRuleId,
		{
			intentPriors: priority.intentPriors,
			xRolePriorityByIntent: priority.xRolePriorityByIntent,
		},
	]),
);
const defaultSemanticMatcher = createSemanticMatcher();

//#endregion

//#region Public matcher API
// Exported entry points used by services and settings validation.

export const semanticRulesFingerprint = defaultSemanticMatcher.fingerprint;
export const builtinSemanticTerms: readonly BuiltinSemanticTerm[] = Object.freeze(builtinSemanticTermRecords.slice());
export const builtinSemanticDomainRules: readonly BuiltinSemanticDomainRule[] = builtinSemanticDomainRuleRecords;

export function createSemanticMatcher(
	options: SemanticMatcherOptions = {},
): SemanticMatcher {
	const disabledBuiltinTermIds = new Set((options.disabledBuiltinTermIds ?? []).filter(Boolean));
	const domainRules = createEffectiveSemanticDomainRules(options.domainRules ?? []);
	const domainTitleTerms = compileDomainRuleTitleTerms(domainRules, options.domainPriority ?? []);
	const titleTerms = compileSemanticTitleTerms([
		...Array.from(builtinTitleTermsByKey.values()).filter(term =>
			!term.id || !disabledBuiltinTermIds.has(term.id)
		),
		...domainTitleTerms,
	]);
	const titleTermsByKey = new Map(titleTerms.map(term => [term.key, term]));
	const semanticDomainPriority = createSemanticDomainPriority(
		domainRules.filter(rule => rule.enabled !== false).map(rule => rule.id),
		options.domainPriority ?? [],
	);
	const rowMarkerTerms = Array.from(builtinRowMarkerTermsByKey.values());
	const rowMarkerTermsByKey = new Map(rowMarkerTerms.map(term => [term.key, term]));
	const fingerprint = `data-resource-semantic:${hashString(stableStringify({
		titleTerms: titleTerms.map(term => ({
			key: term.key,
			title: term.title,
			source: term.source,
			semanticDomains: term.semanticDomains,
		})),
		semanticDomainPriority,
		builtinSemanticDomainXPriority: Array.from(builtinSemanticDomainXPriorityById, ([id, priority]) => ({
			id,
			priority,
		})),
		disabledBuiltinTermIds: Array.from(disabledBuiltinTermIds).sort(),
		rowMarkerTerms: rowMarkerTerms.map(term => ({
			key: term.key,
			kind: term.kind,
		})),
	}))}`;
	return {
		fingerprint,
		matchTitle: value => matchSemanticTitleFromTerms(value, titleTermsByKey),
		matchRowMarker: value => matchSemanticRowMarkerFromTerms(value, rowMarkerTermsByKey),
		toKey: toSemanticTermKey,
		semanticDomainPriority,
		getDomainXPriority: domainId => {
			if (!domainId) {
				return null;
			}
			const priority = builtinSemanticDomainXPriorityById.get(domainId);
			return priority ? priority : null;
		},
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
// Match header keys against built-in semantic terms and domain-rule entries.

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
		? createSemanticTitleMatch(term, key, axisMarker, term.source === "domainRule" ? "semanticDomainRule.term" : "semanticRules.term")
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
	const baseConfidence = term.source === "domainRule" ? 0.97 : 0.95;
	const confidence = clampConfidence(title.axisTendency === axisTendency ? baseConfidence : baseConfidence - 0.07);
	const domainReasons = term.semanticDomains.map(domain => `semanticDomain:${domain.id}:${domain.priorityIndex}`);
	const reasons = axisMarker
		? [reason, `semanticRules.axisMarker:${axisMarker}`]
		: [reason];
	return {
		canonicalRole: title.canonicalRole,
		...(title.canonicalUnit ? { canonicalUnit: title.canonicalUnit } : {}),
		axisTendency,
		semanticDomains: term.semanticDomains,
		...(title.family ? { family: title.family } : {}),
		...(title.ivMode ? { ivMode: title.ivMode } : {}),
		normalizedTitle: key,
		confidence,
		reasons: [...reasons, ...domainReasons],
	};
};

//#endregion

//#region Domain rules and domain-pack filtering
// Compile user/built-in domain rules into key-owned matcher terms and remove disabled built-in domains.

function compileDomainRuleTitleTerms(
	rules: readonly (TemplateSemanticDomainRule & { readonly source: "builtin" | "user" })[],
	priority: readonly string[],
): readonly SemanticTitleTerm[] {
	const semanticDomainPriority = createSemanticDomainPriority(rules.map(rule => rule.id), priority);
	const priorityIndexById = new Map(semanticDomainPriority.map((id, index) => [id, index]));
	const termsByKey = new Map<string, SemanticTitleTerm>();
	for (const rule of rules) {
		if (rule.enabled === false || !isCustomSemanticMatchTermAllowed(rule.title)) {
			continue;
		}
		const priorityIndex = priorityIndexById.get(rule.id);
		if (priorityIndex === undefined) {
			continue;
		}
		const semanticDomain = {
			id: rule.id,
			title: rule.title,
			source: rule.source,
			priorityIndex,
		};
		addDomainRuleTitleTerms(termsByKey, rule, "x", {
			...semanticDomain,
			axisTendency: "x",
		});
		addDomainRuleTitleTerms(termsByKey, rule, "dependent", {
			...semanticDomain,
			axisTendency: "dependent",
		});
	}
	return Array.from(termsByKey.values());
}

function createEffectiveSemanticDomainRules(
	userRules: readonly TemplateSemanticDomainRule[],
): readonly (TemplateSemanticDomainRule & { readonly source: "builtin" | "user" })[] {
	const userRuleIds = new Set(userRules.map(rule => rule.id));
	return [
		...builtinSemanticDomainRuleRecords
			.filter(rule => !userRuleIds.has(rule.id))
			.map(rule => ({ ...rule, source: "builtin" as const, enabled: true })),
		...userRules.map(rule => ({ ...rule, source: "user" as const })),
	];
}

function addDomainRuleTitleTerms(
	termsByKey: Map<string, SemanticTitleTerm>,
	rule: TemplateSemanticDomainRule,
	axisTendency: StructuredAxisTendency,
	semanticDomain: SemanticTitleDomainMatch,
): void {
	const aliases = axisTendency === "x" ? rule.xTerms : rule.yTerms;
	for (const alias of aliases) {
		if (!isCustomSemanticMatchTermAllowed(alias)) {
			continue;
		}
		const key = toSemanticTermKey(alias);
		addSemanticTitleTerm(termsByKey, {
			id: `${rule.id}:${axisTendency}:${key}`,
			key,
			aliases: [alias],
			title: {
				canonicalRole: "unknown",
				axisTendency,
				aliases: [alias],
			},
			source: "domainRule",
			domainPackIds: [],
			semanticDomains: [semanticDomain],
		});
	}
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
		semanticDomains: mergeSemanticDomains(current.semanticDomains, term.semanticDomains),
	});
}

function mergeSemanticDomains(
	current: readonly SemanticTitleDomainMatch[],
	next: readonly SemanticTitleDomainMatch[],
): readonly SemanticTitleDomainMatch[] {
	const values = current.slice();
	const seen = new Set(values.map(domain => `${domain.id}:${domain.axisTendency}`));
	for (const domain of next) {
		const key = `${domain.id}:${domain.axisTendency}`;
		if (seen.has(key)) {
			continue;
		}
		values.push(domain);
		seen.add(key);
	}
	return values.sort((left, right) => left.priorityIndex - right.priorityIndex);
}

function createSemanticDomainPriority(
	ruleIds: readonly string[],
	priority: readonly string[],
): readonly string[] {
	const ruleIdSet = new Set(ruleIds);
	const result: string[] = [];
	const seen = new Set<string>();
	for (const id of priority) {
		if (!ruleIdSet.has(id) || seen.has(id)) {
			continue;
		}
		seen.add(id);
		result.push(id);
	}
	for (const id of ruleIds) {
		if (seen.has(id)) {
			continue;
		}
		seen.add(id);
		result.push(id);
	}
	return result;
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
