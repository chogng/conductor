/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableModelSeed,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import type {
	ColumnProfile,
} from "src/cs/workbench/services/tableModel/common/columnProfile";
import type {
	IvSweepMode,
	MeasurementColumnRole,
	MeasurementFamily,
} from "src/cs/workbench/services/tableModel/common/measurement";
import type {
	SchemaProfile,
	SchemaProfileBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	findSchemaProfileBindingForColumn,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";

type ProfileFamilyInference = {
	readonly family: MeasurementFamily;
	readonly curveType: string;
	readonly ivMode?: IvSweepMode | null;
	readonly xAxisRole?: ImportTableModelSeed["xAxisRole"];
	readonly reason: string;
};

type MatchedProfileBinding = {
	readonly binding: SchemaProfileBinding;
};

export const createSchemaProfileBackedTableModelSeed = ({
	tableModelSeed,
	columnProfiles,
	schemaProfile,
}: {
	readonly tableModelSeed: ImportTableModelSeed;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly schemaProfile: SchemaProfile | null;
}): ImportTableModelSeed => {
	if (!schemaProfile || tableModelSeed.curveFamily !== "unknown") {
		return tableModelSeed;
	}

	const inference = inferFamilyFromProfile({
		columnProfiles,
		schemaProfile,
	});
	if (!inference) {
		return tableModelSeed;
	}

	return {
		...tableModelSeed,
		curveFamily: inference.family,
		curveType: inference.curveType,
		curveTypeConfidence: "high",
		curveTypeNeedsReview: false,
		curveTypeReasons: appendReason(tableModelSeed.curveTypeReasons, inference.reason),
		ivMode: inference.ivMode ?? tableModelSeed.ivMode ?? null,
		xAxisRole: inference.xAxisRole ?? tableModelSeed.xAxisRole,
		xAxisRoleSource: inference.xAxisRole ? "schemaProfile" : tableModelSeed.xAxisRoleSource,
	};
};

const inferFamilyFromProfile = ({
	columnProfiles,
	schemaProfile,
}: {
	readonly columnProfiles: readonly ColumnProfile[];
	readonly schemaProfile: SchemaProfile;
}): ProfileFamilyInference | null => {
	const bindings = columnProfiles
		.map(columnProfile => {
			const binding = findSchemaProfileBindingForColumn(schemaProfile, columnProfile);
			return binding
				? { binding }
				: null;
		})
		.filter((binding): binding is MatchedProfileBinding => binding !== null);
	const xBindings = bindings.filter(({ binding }) => binding.axis === "x");
	const yBindings = bindings.filter(({ binding }) => binding.axis === "y");
	if (!xBindings.length || !yBindings.length) {
		return null;
	}

	if (hasProfileBinding(xBindings, ["vg"], "V") && hasProfileBinding(yBindings, ["id", "current"], "A")) {
		return {
			family: "iv",
			curveType: "transfer",
			ivMode: "transfer",
			xAxisRole: "vg",
			reason: "Exact schema profile confirms transfer x/y bindings.",
		};
	}
	if (hasProfileBinding(xBindings, ["vd"], "V") && hasProfileBinding(yBindings, ["id", "current"], "A")) {
		return {
			family: "iv",
			curveType: "output",
			ivMode: "output",
			xAxisRole: "vd",
			reason: "Exact schema profile confirms output x/y bindings.",
		};
	}
	if (hasProfileBinding(xBindings, ["voltage", "vg", "vd"], "V") && hasProfileBinding(yBindings, ["capacitance"], "F")) {
		return {
			family: "cv",
			curveType: "cv",
			reason: "Exact schema profile confirms capacitance-voltage x/y bindings.",
		};
	}
	if (hasProfileUnit(xBindings, "Hz") && hasProfileBinding(yBindings, ["capacitance"], "F")) {
		return {
			family: "cf",
			curveType: "cf",
			reason: "Exact schema profile confirms capacitance-frequency x/y bindings.",
		};
	}
	if (hasProfileBinding(xBindings, ["time"], "s") && hasProfileBinding(yBindings, ["id", "current"], "A")) {
		return {
			family: "it",
			curveType: "it",
			reason: "Exact schema profile confirms current-time x/y bindings.",
		};
	}

	return null;
};

const hasProfileBinding = (
	bindings: readonly MatchedProfileBinding[],
	roles: readonly MeasurementColumnRole[],
	canonicalUnit: string,
): boolean =>
	bindings.some(({ binding }) =>
		roles.includes(binding.role) &&
		binding.canonicalUnit === canonicalUnit
	);

const hasProfileUnit = (
	bindings: readonly MatchedProfileBinding[],
	canonicalUnit: string,
): boolean =>
	bindings.some(({ binding }) => binding.canonicalUnit === canonicalUnit);

const appendReason = (
	reasons: readonly string[],
	reason: string,
): string[] =>
	reasons.includes(reason)
		? [...reasons]
		: [...reasons, reason];
