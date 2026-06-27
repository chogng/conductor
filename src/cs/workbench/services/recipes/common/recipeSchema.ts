/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type RecipeMeasurementFamily = "iv" | "cv" | "cf" | "pv" | "it" | "unknown";

export type RecipeIvMode = "transfer" | "output" | "unknown";

export type RecipeItMode = "stability" | "transient" | "retention" | "unknown";

export type RecipeColumnRole =
	| "vd"
	| "vg"
	| "vs"
	| "id"
	| "ig"
	| "is"
	| "capacitance"
	| "conductance"
	| "frequency"
	| "time"
	| "voltage"
	| "current"
	| "unknown";

export type RecipeCanonicalUnit = "V" | "A" | "ohm" | "s" | "F" | "Hz" | "S";

export type RecipeDataRange = {
	readonly kind: "detectedDataRegion";
};

export type RecipeBlockPartition = {
	readonly kind: "measurementBlocks";
	readonly select: "each" | "first";
	readonly minConfidence?: number;
};

export type RecipePhysicalLayout =
	| "xy"
	| "xyyyy"
	| "xyxyxy"
	| "blocks.xy"
	| "blocks.xyyyy";

export type RecipeWithinBlock = {
	readonly physicalLayout: RecipePhysicalLayout;
	readonly rowRange: "block.dataRange";
};

export type RecipeLogicalRelation =
	| "oneX-oneY"
	| "oneX-manyY"
	| "oneX-oneY-manyGroups"
	| "manyXYpairs"
	| "manyBlocks-oneX-oneY";

export type RecipeLayoutEvidenceKind =
	| "metadataPreamble"
	| "repeatedBlock"
	| "groupedSweep"
	| "wideMatrix"
	| "timeSeries"
	| "pairwiseXY"
	| "sharedXMultiY"
	| "simpleXY"
	| "unknown";

export type RecipeSeriesPartition =
	| {
		readonly kind: "none";
	}
	| {
		readonly kind: "groupColumn";
		readonly layoutKind?: RecipeLayoutEvidenceKind;
		readonly minConfidence?: number;
	};

export type RecipeDomain = {
	readonly family?: RecipeMeasurementFamily;
	readonly ivMode?: RecipeIvMode;
	readonly itMode?: RecipeItMode;
	readonly minConfidence?: number;
};

export type RecipeRoleCardinality = "one" | "oneOrMore";

export type RecipeRole = {
	readonly roleAny: readonly RecipeColumnRole[];
	readonly canonicalUnit?: RecipeCanonicalUnit;
	readonly count: RecipeRoleCardinality;
	readonly minConfidence?: number;
};

export type RecipeGroupRole = {
	readonly roleAny?: readonly RecipeColumnRole[];
	readonly canonicalUnit?: RecipeCanonicalUnit;
	readonly count?: RecipeRoleCardinality;
	readonly minConfidence?: number;
};

export type RecipeRoles = {
	readonly x: RecipeRole;
	readonly y: RecipeRole;
	readonly group?: RecipeGroupRole;
};
