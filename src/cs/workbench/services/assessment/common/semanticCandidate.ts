/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportFileAssessment,
} from "src/cs/workbench/services/assessment/common/assessment";
import type { ColumnProfile } from "src/cs/workbench/services/assessment/common/columnProfile";
import type { MeasurementColumnRole } from "src/cs/workbench/services/assessment/common/measurement";
import type {
	SchemaProfile,
	SchemaProfileBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	findSchemaProfileBindingForColumn,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import {
	normalizeCellText,
} from "src/cs/workbench/common/cellText";
import builtinSemanticLexicon from "./builtinSemanticLexicon.json";

export type EvidenceSource =
	| "header"
	| "unitRow"
	| "assessment"
	| "schemaProfile"
	| "roleDefault";

export type CanonicalUnit = "V" | "A" | "ohm" | "s" | "F" | "Hz" | "S";

export type ColumnSemanticCandidate = {
	readonly rawCol: number;
	readonly roleCandidates: readonly {
		readonly role: MeasurementColumnRole;
		readonly confidence: number;
		readonly sources: readonly EvidenceSource[];
	}[];
	readonly unitCandidates: readonly {
		readonly canonicalUnit: CanonicalUnit;
		readonly confidence: number;
		readonly sources: readonly EvidenceSource[];
		readonly confirmed: boolean;
	}[];
	readonly displayScale?: {
		readonly unitLabel: "nA" | "uA" | "mA" | "MOhm" | "ms" | string;
		readonly scale: number;
		readonly source: "valueDistribution";
	};
};

export const createColumnSemanticCandidates = ({
	assessment,
	columnProfiles,
	schemaProfile,
}: {
	readonly assessment: ImportFileAssessment;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly schemaProfile?: SchemaProfile | null;
}): readonly ColumnSemanticCandidate[] =>
	columnProfiles.map(profile => {
		const schemaProfileBinding = schemaProfile
			? findSchemaProfileBindingForColumn(schemaProfile, profile)
			: null;
		const headerRole = inferColumnRole(profile.headerText, assessment);
		const roleCandidates = createRoleCandidates({
			headerRole,
			profile,
			schemaProfileBinding,
		});
		const role = roleCandidates[0]?.role ?? "unknown";
		const explicitUnit = inferUnitFromText(profile.explicitUnitText) ??
			inferUnitFromText(profile.headerText);
		const roleUnit = getDefaultUnitForRole(role);
		const unitCandidates = createUnitCandidates({
			explicitUnit,
			roleUnit,
			schemaProfileBinding,
		});
		const unit = unitCandidates[0]?.canonicalUnit ?? null;
		return {
			rawCol: profile.rawCol,
			roleCandidates,
			unitCandidates,
			displayScale: createDisplayScale(profile, unit),
		};
	});

export const getPreferredRoleCandidate = (
	candidate: ColumnSemanticCandidate,
): ColumnSemanticCandidate["roleCandidates"][number] | null =>
	candidate.roleCandidates[0] ?? null;

export const getPreferredUnitCandidate = (
	candidate: ColumnSemanticCandidate,
): ColumnSemanticCandidate["unitCandidates"][number] | null =>
	candidate.unitCandidates[0] ?? null;

const inferColumnRole = (
	headerText: string,
	assessment: ImportFileAssessment,
): MeasurementColumnRole => {
	const normalized = normalizeCellText(headerText).toLowerCase();
	const compact = normalizeCompactText(normalized);
	const text = {
		compact,
		normalized,
	};
	if (!compact) {
		return "unknown";
	}

	if (matchesLexicon(text, "gateVoltage", { contains: true })) {
		return "vg";
	}
	if (matchesLexicon(text, "drainVoltage", { contains: true })) {
		return "vd";
	}
	if (matchesLexicon(text, "sourceVoltage", { contains: true })) {
		return "vs";
	}
	if (matchesLexicon(text, "drainCurrent", { contains: true, prefix: true })) {
		return "id";
	}
	if (matchesLexicon(text, "gateCurrent", { contains: true, prefix: true })) {
		return "ig";
	}
	if (matchesLexicon(text, "sourceCurrent", { contains: true, prefix: true })) {
		return "is";
	}
	if (matchesLexicon(text, "capacitance", { contains: true, prefix: true })) {
		return "capacitance";
	}
	if (matchesLexicon(text, "conductance", { contains: true })) {
		return "conductance";
	}
	if (matchesLexicon(text, "frequency", { contains: true })) {
		return "frequency";
	}
	if (matchesLexicon(text, "time", { contains: true })) {
		return "time";
	}
	if (matchesLexicon(text, "voltage", { contains: true })) {
		return assessment.xAxisRole === "vg"
			? "vg"
			: assessment.xAxisRole === "vd"
				? "vd"
				: "voltage";
	}
	if (matchesLexicon(text, "current", { contains: true })) {
		return "current";
	}
	if (
		assessment.curveFamily === "pv" &&
		matchesLexicon(text, "pulseCurrent")
	) {
		return "current";
	}
	return "unknown";
};

const createRoleCandidates = ({
	headerRole,
	profile,
	schemaProfileBinding,
}: {
	readonly headerRole: MeasurementColumnRole;
	readonly profile: ColumnProfile;
	readonly schemaProfileBinding: SchemaProfileBinding | null;
}): ColumnSemanticCandidate["roleCandidates"] => {
	const candidates: ColumnSemanticCandidate["roleCandidates"][number][] = [];
	if (schemaProfileBinding && schemaProfileBinding.role !== "unknown") {
		candidates.push({
			role: schemaProfileBinding.role,
			confidence: 0.96,
			sources: ["schemaProfile"],
		});
	}
	if (
		headerRole !== "unknown" &&
		!candidates.some(candidate => candidate.role === headerRole)
	) {
		candidates.push({
			role: headerRole,
			confidence: getRoleConfidence({
				headerText: profile.headerText,
				role: headerRole,
			}),
			sources: ["header"],
		});
	}
	if (!candidates.length) {
		candidates.push({
			role: "unknown",
			confidence: getRoleConfidence({
				headerText: profile.headerText,
				role: "unknown",
			}),
			sources: [],
		});
	}

	return candidates;
};

const createUnitCandidates = ({
	explicitUnit,
	roleUnit,
	schemaProfileBinding,
}: {
	readonly explicitUnit: CanonicalUnit | null;
	readonly roleUnit: CanonicalUnit | null;
	readonly schemaProfileBinding: SchemaProfileBinding | null;
}): ColumnSemanticCandidate["unitCandidates"] => {
	const candidates: ColumnSemanticCandidate["unitCandidates"][number][] = [];
	const schemaProfileUnit = schemaProfileBinding?.canonicalUnit ?? null;
	if (schemaProfileUnit) {
		candidates.push({
			canonicalUnit: schemaProfileUnit,
			confidence: 0.96,
			sources: ["schemaProfile"],
			confirmed: true,
		});
	}
	if (
		explicitUnit &&
		!candidates.some(candidate => candidate.canonicalUnit === explicitUnit)
	) {
		candidates.push({
			canonicalUnit: explicitUnit,
			confidence: 0.9,
			sources: ["header"],
			confirmed: true,
		});
	}
	if (
		roleUnit &&
		!candidates.some(candidate => candidate.canonicalUnit === roleUnit)
	) {
		candidates.push({
			canonicalUnit: roleUnit,
			confidence: 0.72,
			sources: ["roleDefault"],
			confirmed: false,
		});
	}

	return candidates;
};

const inferUnitFromText = (
	value: unknown,
): CanonicalUnit | null => {
	const normalized = normalizeCellText(value);
	if (!normalized) {
		return null;
	}

	const lower = normalized.toLowerCase();
	const bracketUnit = lower.match(
		/(?:\(|\[|\{)\s*([munp]?a|[munp]?v|[munp]?f|hz|khz|mhz|ghz|ohm|kohm|mohm|s|ms|us|ns)\s*(?:\)|\]|\})/i,
	);
	const unitText = bracketUnit?.[1] ?? lower;
	const compact = normalizeCompactText(unitText);
	if (!compact) {
		return null;
	}

	if (
		compact === "hz" ||
		compact === "khz" ||
		compact === "mhz" ||
		compact === "ghz" ||
		compact.includes("freq") ||
		compact.includes("frequency")
	) {
		return "Hz";
	}
	if (
		compact === "ohm" ||
		compact === "kohm" ||
		compact === "mohm" ||
		compact.includes("resistance")
	) {
		return "ohm";
	}
	if (
		compact === "s" ||
		compact === "ms" ||
		compact === "us" ||
		compact === "ns" ||
		compact.includes("time")
	) {
		return "s";
	}
	if (
		compact === "a" ||
		compact === "ma" ||
		compact === "ua" ||
		compact === "na" ||
		compact === "pa" ||
		compact.includes("amp") ||
		compact.includes("current")
	) {
		return "A";
	}
	if (
		compact === "v" ||
		compact === "mv" ||
		compact === "uv" ||
		compact === "nv" ||
		compact.includes("volt") ||
		compact.includes("voltage")
	) {
		return "V";
	}
	if (
		compact === "f" ||
		compact === "mf" ||
		compact === "uf" ||
		compact === "nf" ||
		compact === "pf" ||
		compact.includes("farad") ||
		compact.includes("capacitance")
	) {
		return "F";
	}
	return null;
};

const getDefaultUnitForRole = (
	role: MeasurementColumnRole,
): CanonicalUnit | null => {
	switch (role) {
		case "vd":
		case "vg":
		case "vs":
		case "voltage":
			return "V";
		case "id":
		case "ig":
		case "is":
		case "current":
			return "A";
		case "capacitance":
			return "F";
		case "conductance":
			return "S";
		case "frequency":
			return "Hz";
		case "time":
			return "s";
		case "unknown":
			return null;
	}
};

const getRoleConfidence = ({
	headerText,
	role,
}: {
	readonly headerText: string;
	readonly role: MeasurementColumnRole;
}): number => {
	if (role !== "unknown") {
		return 0.82;
	}
	if (inferUnitFromText(headerText)) {
		return 0.35;
	}
	return 0.2;
};

const createDisplayScale = (
	profile: ColumnProfile,
	unit: CanonicalUnit | null,
): ColumnSemanticCandidate["displayScale"] | undefined => {
	const medianAbs = profile.numericStats?.medianAbs ?? 0;
	if (!medianAbs || !Number.isFinite(medianAbs)) {
		return undefined;
	}
	if (unit === "A" && medianAbs > 0 && medianAbs < 1e-6) {
		return {
			unitLabel: "nA",
			scale: 1e9,
			source: "valueDistribution",
		};
	}
	if (unit === "A" && medianAbs >= 1e-6 && medianAbs < 1e-3) {
		return {
			unitLabel: "uA",
			scale: 1e6,
			source: "valueDistribution",
		};
	}
	if (unit === "A" && medianAbs >= 1e-3 && medianAbs < 1) {
		return {
			unitLabel: "mA",
			scale: 1e3,
			source: "valueDistribution",
		};
	}
	return undefined;
};

const normalizeCompactText = (
	value: unknown,
): string =>
	normalizeCellText(value)
		.toLowerCase()
		.replace(/[\s_\-./()[\]{}:=`]+/g, "");

type BuiltinSemanticLexiconKey = keyof typeof builtinSemanticLexicon;

const matchesLexicon = (
	value: {
		readonly compact: string;
		readonly normalized: string;
	},
	key: BuiltinSemanticLexiconKey,
	options: {
		readonly contains?: boolean;
		readonly prefix?: boolean;
	} = {},
): boolean =>
	builtinSemanticLexicon[key].some(term => {
		const normalizedTerm = normalizeCellText(term).toLowerCase();
		const compactTerm = normalizeCompactText(normalizedTerm);
		if (!compactTerm) {
			return false;
		}
		if (value.compact === compactTerm) {
			return true;
		}
		if (options.prefix && value.compact.startsWith(compactTerm)) {
			return true;
		}
		return Boolean(options.contains) && compactTerm.length > 1 && (
			value.compact.includes(compactTerm) ||
			(normalizedTerm.length > 1 && value.normalized.includes(normalizedTerm))
		);
	});
