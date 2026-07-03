/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { stableStringify } from "src/cs/base/common/objects";
import cvRulesJson from "../../../../../../resources/rules/v1/cv.json";
import frequencyRulesJson from "../../../../../../resources/rules/v1/frequency.json";
import genericRulesJson from "../../../../../../resources/rules/v1/generic.json";
import ivRulesJson from "../../../../../../resources/rules/v1/iv.json";
import pvRulesJson from "../../../../../../resources/rules/v1/pv.json";
import supplementRulesJson from "../../../../../../resources/rules/v1/supplement.json";
import transientRulesJson from "../../../../../../resources/rules/v1/transient.json";
import type {
	StructuredAxisTendency,
	StructuredMeasurementColumnRole,
} from "./structuredContent";
import type {
	TemplateSemanticPatches,
	TemplateSemanticRuleAxisPatch,
	TemplateSemanticRulePatch,
	TemplateSemanticTermPatch,
} from "src/cs/workbench/services/settings/common/settings";

//#region Public semantic contracts
// Stable values consumed by DataResource evidence, Settings UI, and Review callers.

export type SemanticTitleMatch = {
	readonly canonicalRole: StructuredMeasurementColumnRole;
	readonly axisTendency: StructuredAxisTendency;
	readonly semanticRules: readonly SemanticTitleRuleMatch[];
	readonly normalizedTitle: string;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export type SemanticTitleRuleMatch = {
	readonly id: string;
	readonly label: string;
	readonly badge?: string;
	readonly axisTendency: StructuredAxisTendency;
	readonly priority: number;
	readonly priorityIndex: number;
	readonly source: "builtin" | "user";
};

export type SemanticRowMarkerKind = "titleRow" | "dataRow";

export type SemanticRule = {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly priority: number;
	readonly badge?: string;
	readonly xTerms: readonly string[];
	readonly yTerms: readonly string[];
	readonly enabled: boolean;
};

export type BuiltinRule = SemanticRule & {
	readonly source: "builtin";
};

//#endregion

//#region Rule schema and lookup records
// Internal shapes for bundled rules plus normalized lookup entries.

type RuleTermRecord = {
	readonly key: string;
	readonly aliases: readonly string[];
};

type RuleColumnRecord = {
	readonly id: number;
	readonly label: string;
	readonly terms: readonly RuleTermRecord[];
};

type RuleRecord = {
	readonly id: number;
	readonly label: string;
	readonly description?: string;
	readonly priority: number;
	readonly badge?: string;
	readonly columns: {
		readonly x: readonly RuleColumnRecord[];
		readonly y: readonly RuleColumnRecord[];
	};
};

type RuleFile = {
	readonly schemaVersion: 1;
	readonly rules: readonly RuleRecord[];
};

type RuleFileInput = {
	readonly fileId: string;
	readonly file: RuleFile;
};

type SupplementTermSet = {
	readonly key: string;
	readonly aliases: readonly string[];
};

type SupplementRecord = {
	readonly id: number;
	readonly label: string;
	readonly match: {
		readonly titleRowTerms?: readonly SupplementTermSet[];
		readonly dataRowTerms?: readonly SupplementTermSet[];
	};
};

type SupplementFile = {
	readonly schemaVersion: 1;
	readonly supplements: readonly SupplementRecord[];
};

type SemanticTitleTerm = {
	readonly key: string;
	readonly aliases: readonly string[];
	readonly ruleMatches: readonly SemanticTitleRuleMatch[];
};

type SemanticRowMarkerTerm = {
	readonly key: string;
	readonly aliases: readonly string[];
	readonly kind: SemanticRowMarkerKind;
};

export type EffectiveSemanticRule = SemanticRule & {
	readonly source: "builtin" | "user";
};

type EffectiveRuleState = Omit<SemanticRule, "xTerms" | "yTerms"> & {
	readonly source: "builtin" | "user";
	readonly xKeys: readonly string[];
	readonly yKeys: readonly string[];
};

type SemanticTermAliasSource = "builtin" | "user";

type SemanticTermAliasRecord = {
	readonly text: string;
	readonly source: SemanticTermAliasSource;
};

type SemanticTermIndexRecord = {
	readonly key: string;
	readonly aliases: readonly SemanticTermAliasRecord[];
};

//#endregion

//#region Matcher options and instance contract
// Settings-derived options add user-defined rules to the bundled rule set.

export type SemanticMatcherOptions = {
	readonly patches?: TemplateSemanticPatches;
};

export type SemanticMatcher = {
	readonly fingerprint: string;
	readonly matchTitle: (value: unknown) => SemanticTitleMatch | null;
	readonly matchRowMarker: (value: unknown) => SemanticRowMarkerKind | null;
	readonly toKey: (value: unknown) => string;
	readonly rulePriority: readonly string[];
};

//#endregion

const semanticRuleFiles: readonly RuleFileInput[] = [
	{ fileId: "iv", file: ivRulesJson as unknown as RuleFile },
	{ fileId: "cv", file: cvRulesJson as unknown as RuleFile },
	{ fileId: "frequency", file: frequencyRulesJson as unknown as RuleFile },
	{ fileId: "transient", file: transientRulesJson as unknown as RuleFile },
	{ fileId: "generic", file: genericRulesJson as unknown as RuleFile },
	{ fileId: "pv", file: pvRulesJson as unknown as RuleFile },
];

const builtinRuleRecords: readonly BuiltinRule[] = Object.freeze(
	compileBuiltinRules(semanticRuleFiles),
);
const builtinRowMarkerTermsByKey = compileSupplementRowMarkers(
	supplementRulesJson as unknown as SupplementFile,
);
const defaultSemanticMatcher = createSemanticMatcher();

//#region Public matcher API
// Exported entry points used by services and settings validation.

export const semanticRulesFingerprint = defaultSemanticMatcher.fingerprint;
export const builtinRules: readonly BuiltinRule[] = builtinRuleRecords;

export function createSemanticMatcher(
	options: SemanticMatcherOptions = {},
): SemanticMatcher {
	const effectiveRules = createEffectiveRules(options.patches);
	const rulePriority = createRulePriority(effectiveRules);
	const priorityIndexById = new Map(rulePriority.map((id, index) => [id, index]));
	const titleTerms = compileRuleTitleTerms(effectiveRules, priorityIndexById);
	const titleTermsByKey = new Map(titleTerms.map(term => [term.key, term]));
	const rowMarkerTerms = Array.from(builtinRowMarkerTermsByKey.values());
	const rowMarkerTermsByKey = new Map(rowMarkerTerms.map(term => [term.key, term]));
	const fingerprint = `data-resource-rules:${hashString(stableStringify({
		rules: effectiveRules.map(rule => ({
			id: rule.id,
			label: rule.label,
			priority: rule.priority,
			badge: rule.badge,
			enabled: rule.enabled,
			xTerms: rule.xTerms,
			yTerms: rule.yTerms,
			source: rule.source,
		})),
		rulePriority,
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
		rulePriority,
	};
}

export const matchSemanticTitle = (
	value: unknown,
): SemanticTitleMatch | null => defaultSemanticMatcher.matchTitle(value);

export const matchSemanticRowMarker = (
	value: unknown,
): SemanticRowMarkerKind | null => defaultSemanticMatcher.matchRowMarker(value);

export const createEffectiveSemanticRules = (
	patches?: TemplateSemanticPatches,
): readonly EffectiveSemanticRule[] => createEffectiveRules(patches);

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

//#region Built-in rule compilation

function compileBuiltinRules(
	files: readonly RuleFileInput[],
): readonly BuiltinRule[] {
	const rules: BuiltinRule[] = [];
	const ruleIds = new Set<string>();
	for (const { fileId, file } of files) {
		if (file.schemaVersion !== 1) {
			throw new Error(`Unsupported rule schema version in ${fileId}.`);
		}
		const localIds = new Set<number>();
		for (const rule of file.rules) {
			if (localIds.has(rule.id)) {
				throw new Error(`Duplicate rule id ${rule.id} in ${fileId}.`);
			}
			localIds.add(rule.id);
			validateRuleRecord(fileId, rule);
			const compiled = toBuiltinRule(fileId, rule);
			if (ruleIds.has(compiled.id)) {
				throw new Error(`Duplicate compiled rule id ${compiled.id}.`);
			}
			ruleIds.add(compiled.id);
			rules.push(compiled);
		}
	}
	return rules.sort(compareTemplateRules).map(rule => Object.freeze(rule));
}

function validateRuleRecord(
	fileId: string,
	rule: RuleRecord,
): void {
	if (!Number.isInteger(rule.id) || rule.id <= 0) {
		throw new Error(`Invalid rule id in ${fileId}.`);
	}
	if (!rule.label.trim()) {
		throw new Error(`Missing rule label in ${fileId}:${rule.id}.`);
	}
	if (!Number.isFinite(rule.priority)) {
		throw new Error(`Invalid rule priority in ${fileId}:${rule.id}.`);
	}
	const xKeys = validateRuleColumns(fileId, rule.id, "x", rule.columns.x);
	const yKeys = validateRuleColumns(fileId, rule.id, "y", rule.columns.y);
	if (!xKeys.size || !yKeys.size) {
		throw new Error(`Rule ${fileId}:${rule.id} must contain X and Y terms.`);
	}
	for (const key of xKeys) {
		if (yKeys.has(key)) {
			throw new Error(`Rule term "${key}" is configured as both X and Y in ${fileId}:${rule.id}.`);
		}
	}
}

function validateRuleColumns(
	fileId: string,
	ruleId: number,
	axis: "x" | "y",
	columns: readonly RuleColumnRecord[],
): ReadonlySet<string> {
	const columnIds = new Set<number>();
	const keys = new Set<string>();
	for (const column of columns) {
		if (!Number.isInteger(column.id) || column.id <= 0) {
			throw new Error(`Invalid ${axis} column id in ${fileId}:${ruleId}.`);
		}
		if (columnIds.has(column.id)) {
			throw new Error(`Duplicate ${axis} column id ${column.id} in ${fileId}:${ruleId}.`);
		}
		columnIds.add(column.id);
		if (!column.label.trim()) {
			throw new Error(`Missing ${axis} column label in ${fileId}:${ruleId}:${column.id}.`);
		}
		for (const term of column.terms) {
			if (!term.key || !isCustomSemanticMatchTermAllowed(term.key)) {
				throw new Error(`Invalid ${axis} term key in ${fileId}:${ruleId}:${column.id}.`);
			}
			for (const alias of term.aliases) {
				if (!isCustomSemanticMatchTermAllowed(alias)) {
					throw new Error(`Invalid ${axis} alias "${alias}" in ${fileId}:${ruleId}:${column.id}.`);
				}
				const aliasKey = toSemanticTermKey(alias);
				if (aliasKey !== term.key) {
					throw new Error(`Alias "${alias}" does not match key "${term.key}" in ${fileId}:${ruleId}:${column.id}.`);
				}
				keys.add(aliasKey);
			}
		}
	}
	return keys;
}

function toBuiltinRule(
	fileId: string,
	rule: RuleRecord,
): BuiltinRule {
	return {
		id: `${fileId}:${rule.id}`,
		label: rule.label.trim(),
		description: normalizeText(rule.description),
		priority: rule.priority,
		...(normalizeText(rule.badge) ? { badge: normalizeText(rule.badge) } : {}),
		xTerms: flattenRuleTerms(rule.columns.x),
		yTerms: flattenRuleTerms(rule.columns.y),
		enabled: true,
		source: "builtin",
	};
}

function flattenRuleTerms(
	columns: readonly RuleColumnRecord[],
): readonly string[] {
	const terms: string[] = [];
	const seen = new Set<string>();
	for (const column of columns) {
		for (const term of column.terms) {
			for (const alias of term.aliases) {
				const key = toSemanticTermKey(alias);
				if (!key || seen.has(key)) {
					continue;
				}
				seen.add(key);
				terms.push(alias);
			}
		}
	}
	return terms;
}

//#endregion

//#region Supplement compilation

function compileSupplementRowMarkers(
	file: SupplementFile,
): ReadonlyMap<string, SemanticRowMarkerTerm> {
	if (file.schemaVersion !== 1) {
		throw new Error("Unsupported supplement schema version.");
	}
	const termsByKey = new Map<string, SemanticRowMarkerTerm>();
	for (const supplement of file.supplements) {
		addSupplementMarkerTerms(termsByKey, supplement, "titleRow", supplement.match.titleRowTerms ?? []);
		addSupplementMarkerTerms(termsByKey, supplement, "dataRow", supplement.match.dataRowTerms ?? []);
	}
	return termsByKey;
}

function addSupplementMarkerTerms(
	termsByKey: Map<string, SemanticRowMarkerTerm>,
	supplement: SupplementRecord,
	kind: SemanticRowMarkerKind,
	terms: readonly SupplementTermSet[],
): void {
	for (const term of terms) {
		for (const alias of term.aliases) {
			const key = toSemanticTermKey(alias);
			if (!key || key !== term.key) {
				throw new Error(`Invalid supplement alias "${alias}" in ${supplement.label}:${supplement.id}.`);
			}
			const current = termsByKey.get(key);
			if (current && current.kind !== kind) {
				throw new Error(`Supplement alias "${alias}" is configured as both ${current.kind} and ${kind}.`);
			}
			termsByKey.set(key, current
				? {
					...current,
					aliases: mergeUniqueValues(current.aliases, [alias]),
				}
				: {
					key,
					aliases: [alias],
					kind,
				});
		}
	}
}

//#endregion

//#region Rule matching

function createEffectiveRules(
	patches: TemplateSemanticPatches | undefined,
): readonly EffectiveSemanticRule[] {
	const termIndex = createTermIndex(patches?.terms ?? []);
	const rulesById = new Map<string, EffectiveRuleState>();
	for (const rule of builtinRuleRecords) {
		rulesById.set(rule.id, {
			id: rule.id,
			label: rule.label,
			...(rule.description ? { description: rule.description } : {}),
			priority: rule.priority,
			...(rule.badge ? { badge: rule.badge } : {}),
			enabled: rule.enabled,
			source: "builtin",
			xKeys: termsToKeys(rule.xTerms),
			yKeys: termsToKeys(rule.yTerms),
		});
	}
	for (const patch of patches?.rules ?? []) {
		const current = rulesById.get(patch.id);
		if (!current && !isValidNewRulePatch(patch)) {
			continue;
		}
		const base = current ?? createUserRuleState(patch);
		rulesById.set(patch.id, applyRulePatch(base, patch));
	}
	return Array.from(rulesById.values())
		.filter(rule => rule.enabled !== false)
		.map(rule => toEffectiveRule(rule, termIndex))
		.filter(rule => rule.xTerms.length && rule.yTerms.length)
		.sort(compareTemplateRules);
}

function createTermIndex(
	patches: readonly TemplateSemanticTermPatch[],
): ReadonlyMap<string, SemanticTermIndexRecord> {
	const recordsByKey = new Map<string, SemanticTermIndexRecord>();
	for (const rule of builtinRuleRecords) {
		for (const alias of [...rule.xTerms, ...rule.yTerms]) {
			addTermIndexAlias(recordsByKey, toSemanticTermKey(alias), alias, "builtin");
		}
	}
	for (const patch of patches) {
		for (const alias of patch.removeAliases) {
			removeTermIndexAlias(recordsByKey, patch.key, alias);
		}
		for (const alias of patch.addAliases) {
			if (toSemanticTermKey(alias) === patch.key) {
				addTermIndexAlias(recordsByKey, patch.key, alias, "user");
			}
		}
	}
	return recordsByKey;
}

function addTermIndexAlias(
	recordsByKey: Map<string, SemanticTermIndexRecord>,
	key: string,
	alias: string,
	source: SemanticTermAliasSource,
): void {
	if (!key || !alias) {
		return;
	}
	const current = recordsByKey.get(key);
	if (!current) {
		recordsByKey.set(key, {
			key,
			aliases: [{ text: alias, source }],
		});
		return;
	}
	if (current.aliases.some(record => record.text === alias)) {
		return;
	}
	recordsByKey.set(key, {
		...current,
		aliases: [...current.aliases, { text: alias, source }],
	});
}

function removeTermIndexAlias(
	recordsByKey: Map<string, SemanticTermIndexRecord>,
	key: string,
	alias: string,
): void {
	const current = recordsByKey.get(key);
	if (!current) {
		return;
	}
	const aliases = current.aliases.filter(record => record.text !== alias);
	recordsByKey.set(key, {
		...current,
		aliases,
	});
}

function isValidNewRulePatch(
	patch: TemplateSemanticRulePatch,
): boolean {
	return Boolean(
		patch.label?.trim() &&
		patch.xKeys?.addKeys.length &&
		patch.yKeys?.addKeys.length
	);
}

function createUserRuleState(
	patch: TemplateSemanticRulePatch,
): EffectiveRuleState {
	return {
		id: patch.id,
		label: patch.label?.trim() ?? patch.id,
		...(patch.description ? { description: patch.description } : {}),
		priority: Number.isFinite(patch.priority) ? Number(patch.priority) : 0,
		...(patch.badge ? { badge: patch.badge } : {}),
		enabled: patch.enabled !== false,
		source: "user",
		xKeys: [],
		yKeys: [],
	};
}

function applyRulePatch(
	base: EffectiveRuleState,
	patch: TemplateSemanticRulePatch,
): EffectiveRuleState {
	return {
		...base,
		...(patch.label ? { label: patch.label } : {}),
		...(patch.description ? { description: patch.description } : {}),
		...(Number.isFinite(patch.priority) ? { priority: Number(patch.priority) } : {}),
		...(patch.badge ? { badge: patch.badge } : {}),
		...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
		xKeys: applyRuleAxisPatch(base.xKeys, patch.xKeys),
		yKeys: applyRuleAxisPatch(base.yKeys, patch.yKeys),
	};
}

function applyRuleAxisPatch(
	keys: readonly string[],
	patch: TemplateSemanticRuleAxisPatch | undefined,
): readonly string[] {
	if (!patch) {
		return keys;
	}
	const nextKeys = keys.filter(key => !patch.removeKeys.includes(key));
	for (const key of patch.addKeys) {
		if (!nextKeys.includes(key)) {
			nextKeys.push(key);
		}
	}
	return nextKeys;
}

function toEffectiveRule(
	rule: EffectiveRuleState,
	termIndex: ReadonlyMap<string, SemanticTermIndexRecord>,
): EffectiveSemanticRule {
	return {
		id: rule.id,
		label: rule.label,
		...(rule.description ? { description: rule.description } : {}),
		priority: rule.priority,
		...(rule.badge ? { badge: rule.badge } : {}),
		enabled: rule.enabled,
		source: rule.source,
		xTerms: keysToAliases(rule.xKeys, termIndex),
		yTerms: keysToAliases(rule.yKeys, termIndex),
	};
}

function termsToKeys(
	terms: readonly string[],
): readonly string[] {
	const keys: string[] = [];
	for (const term of terms) {
		const key = toSemanticTermKey(term);
		if (key && !keys.includes(key)) {
			keys.push(key);
		}
	}
	return keys;
}

function keysToAliases(
	keys: readonly string[],
	termIndex: ReadonlyMap<string, SemanticTermIndexRecord>,
): readonly string[] {
	const aliases: string[] = [];
	for (const key of keys) {
		for (const alias of termIndex.get(key)?.aliases ?? []) {
			if (!aliases.includes(alias.text)) {
				aliases.push(alias.text);
			}
		}
	}
	return aliases;
}

function createRulePriority(
	rules: readonly EffectiveSemanticRule[],
): readonly string[] {
	return rules.map(rule => rule.id);
}

function compareTemplateRules(
	left: Pick<SemanticRule, "id" | "priority">,
	right: Pick<SemanticRule, "id" | "priority">,
): number {
	return left.priority - right.priority || left.id.localeCompare(right.id);
}

function compileRuleTitleTerms(
	rules: readonly EffectiveSemanticRule[],
	priorityIndexById: ReadonlyMap<string, number>,
): readonly SemanticTitleTerm[] {
	const termsByKey = new Map<string, SemanticTitleTerm>();
	for (const rule of rules) {
		const priorityIndex = priorityIndexById.get(rule.id);
		if (priorityIndex === undefined) {
			continue;
		}
		addRuleTitleTerms(termsByKey, rule, "x", priorityIndex, rule.xTerms);
		addRuleTitleTerms(termsByKey, rule, "dependent", priorityIndex, rule.yTerms);
	}
	return Array.from(termsByKey.values());
}

function addRuleTitleTerms(
	termsByKey: Map<string, SemanticTitleTerm>,
	rule: EffectiveSemanticRule,
	axisTendency: StructuredAxisTendency,
	priorityIndex: number,
	aliases: readonly string[],
): void {
	const ruleMatch: SemanticTitleRuleMatch = {
		id: rule.id,
		label: rule.label,
		...(rule.badge ? { badge: rule.badge } : {}),
		axisTendency,
		priority: rule.priority,
		priorityIndex,
		source: rule.source,
	};
	for (const alias of aliases) {
		if (!isCustomSemanticMatchTermAllowed(alias)) {
			continue;
		}
		const key = toSemanticTermKey(alias);
		const current = termsByKey.get(key);
		if (!current) {
			termsByKey.set(key, {
				key,
				aliases: [alias],
				ruleMatches: [ruleMatch],
			});
			continue;
		}
		termsByKey.set(key, {
			...current,
			aliases: mergeUniqueValues(current.aliases, [alias]),
			ruleMatches: mergeRuleMatches(current.ruleMatches, [ruleMatch]),
		});
	}
}

function mergeRuleMatches(
	current: readonly SemanticTitleRuleMatch[],
	next: readonly SemanticTitleRuleMatch[],
): readonly SemanticTitleRuleMatch[] {
	const values = current.slice();
	const seen = new Set(values.map(rule => `${rule.id}:${rule.axisTendency}`));
	for (const rule of next) {
		const key = `${rule.id}:${rule.axisTendency}`;
		if (seen.has(key)) {
			continue;
		}
		values.push(rule);
		seen.add(key);
	}
	return values.sort((left, right) =>
		left.priorityIndex - right.priorityIndex ||
		axisSortIndex(left.axisTendency) - axisSortIndex(right.axisTendency)
	);
}

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
		? createSemanticTitleMatch(term, key, axisMarker)
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

function createSemanticTitleMatch(
	term: SemanticTitleTerm,
	key: string,
	axisMarker: StructuredAxisTendency | null,
): SemanticTitleMatch {
	const axisRuleMatches = axisMarker
		? term.ruleMatches.filter(rule => rule.axisTendency === axisMarker)
		: [];
	const ruleMatches = axisRuleMatches.length ? axisRuleMatches : term.ruleMatches;
	const axisTendency = axisMarker ?? readRuleMatchesAxisTendency(ruleMatches);
	const baseConfidence = ruleMatches.some(rule => rule.source === "user") ? 0.97 : 0.95;
	const confidence = clampConfidence(axisTendency === "unknown" ? baseConfidence - 0.05 : baseConfidence);
	const reasons = [
		"rules.term",
		...(axisMarker ? [`rules.axisMarker:${axisMarker}`] : []),
		...ruleMatches.map(rule => `rule:${rule.id}:${rule.axisTendency}:${rule.priorityIndex}`),
	];
	return {
		canonicalRole: "unknown",
		axisTendency,
		semanticRules: ruleMatches,
		normalizedTitle: key,
		confidence,
		reasons,
	};
}

function readRuleMatchesAxisTendency(
	ruleMatches: readonly SemanticTitleRuleMatch[],
): StructuredAxisTendency {
	const hasX = ruleMatches.some(rule => rule.axisTendency === "x");
	const hasY = ruleMatches.some(rule => rule.axisTendency === "dependent");
	if (hasX && !hasY) {
		return "x";
	}
	if (hasY && !hasX) {
		return "dependent";
	}
	return "unknown";
}

function axisSortIndex(
	axisTendency: StructuredAxisTendency,
): number {
	if (axisTendency === "x") {
		return 0;
	}
	if (axisTendency === "dependent") {
		return 1;
	}
	return 2;
}

//#endregion

//#region Axis-marker handling
// Optional trailing X/Y markers refine the rule axis without changing the term.

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
