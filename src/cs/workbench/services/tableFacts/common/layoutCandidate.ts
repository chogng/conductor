/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ColumnProfile,
} from "src/cs/workbench/services/tableFacts/common/columnProfile";
import type {
	TableFactsSourceRange,
} from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type {
	RawTableStructure,
} from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import {
	parseFiniteNumber,
} from "src/cs/workbench/common/cellText";

export type LayoutKind =
	| "metadataPreamble"
	| "repeatedBlock"
	| "groupedSweep"
	| "wideMatrix"
	| "timeSeries"
	| "pairwiseXY"
	| "sharedXMultiY"
	| "simpleXY"
	| "unknown";

export type LayoutBindingDraft = {
	readonly blockRegionId?: string;
	readonly dataRange?: TableFactsSourceRange;
	readonly headerRange?: TableFactsSourceRange;
	readonly xCol?: number;
	readonly yCols?: readonly number[];
	readonly groupByCol?: number;
	readonly pointCol?: number;
	readonly biasCols?: readonly number[];
};

export type LayoutCandidate = {
	readonly id: string;
	readonly layoutKind: LayoutKind;
	readonly confidence: number;
	readonly bindings: readonly LayoutBindingDraft[];
	readonly reasons: readonly string[];
};

export type DetectLayoutCandidatesInput = {
	readonly columnProfiles: readonly ColumnProfile[];
	readonly structure: RawTableStructure;
};

export const detectLayoutCandidates = ({
	columnProfiles,
	structure,
}: DetectLayoutCandidatesInput): readonly LayoutCandidate[] => {
	const detectors: readonly (() => LayoutCandidate | null)[] = [
		() => detectMetadataPreambleLayout(columnProfiles, structure),
		() => detectRepeatedBlockLayout(columnProfiles, structure),
		() => detectGroupedSweepLayout(columnProfiles, structure),
		() => detectWideMatrixLayout(columnProfiles, structure),
		() => detectTimeSeriesLayout(columnProfiles, structure),
		() => detectPairwiseXYLayout(columnProfiles, structure),
		() => detectSharedXMultiYLayout(columnProfiles, structure),
		() => detectSimpleXYLayout(columnProfiles, structure),
	];
	const candidates = detectors
		.map(detector => detector())
		.filter((candidate): candidate is LayoutCandidate => candidate !== null)
		.sort((left, right) => right.confidence - left.confidence);

	return candidates.length
		? candidates
		: [createUnknownLayoutCandidate()];
};

export const getBestReadyLayoutCandidate = (
	candidates: readonly LayoutCandidate[] | undefined,
): LayoutCandidate | null =>
	(candidates ?? []).find(isReadyLayoutCandidate) ?? null;

export const isReadyLayoutCandidate = (
	candidate: LayoutCandidate,
): boolean =>
	candidate.confidence >= 0.75 &&
	candidate.bindings.some(binding =>
		Number.isInteger(binding.xCol) &&
		Boolean(binding.yCols?.length)
	);

const detectMetadataPreambleLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	const header = structure.headerRows[0] ?? null;
	if (header?.source !== "dataName") {
		return null;
	}

	const binding = createSharedNumericBinding(columnProfiles, structure);
	if (!binding) {
		return null;
	}

	return {
		id: "layout:metadataPreamble",
		layoutKind: "metadataPreamble",
		confidence: 0.9,
		bindings: [binding],
		reasons: [
			"Detected metadata preamble with DataName/DataValue table rows.",
			"Numeric data columns form a usable X/Y draft.",
		],
	};
};

const detectRepeatedBlockLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	if (structure.blockRegions.length < 2) {
		return null;
	}

	const numericBinding = createSharedNumericBinding(columnProfiles, structure);
	if (!numericBinding) {
		return null;
	}

	const bindings = structure.blockRegions.map((blockRegion, index) => ({
		...numericBinding,
		blockRegionId: blockRegion.id,
		dataRange: structure.dataRegions[index]?.range ?? numericBinding.dataRange,
		headerRange: structure.headerRows[index]?.range ?? numericBinding.headerRange,
	}));

	return {
		id: "layout:repeatedBlock",
		layoutKind: "repeatedBlock",
		confidence: 0.92,
		bindings,
		reasons: [
			"Detected repeated header sections with the same schema fingerprint.",
			"Each repeated section has a numeric X/Y draft.",
		],
	};
};

const detectGroupedSweepLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	const pointColumn = columnProfiles.find(profile =>
		isNumericProfile(profile) &&
		isPointHeader(profile.headerText)
	) ?? null;
	if (!pointColumn) {
		return null;
	}

	const numericAfterPoint = columnProfiles.filter(profile =>
		isNumericProfile(profile) &&
		profile.rawCol > pointColumn.rawCol
	);
	if (numericAfterPoint.length < 2) {
		return null;
	}

	const xColumn = numericAfterPoint[0];
	const yColumn = numericAfterPoint.find(profile => profile.rawCol > xColumn.rawCol) ??
		numericAfterPoint.find(profile => profile.rawCol !== xColumn.rawCol) ??
		null;
	if (!yColumn) {
		return null;
	}

	const groupColumn = chooseGroupColumn(columnProfiles.filter(profile =>
		isNumericProfile(profile) &&
		profile.rawCol < pointColumn.rawCol
	));
	const biasColumns = numericAfterPoint
		.filter(profile => profile.rawCol !== xColumn.rawCol && profile.rawCol !== yColumn.rawCol)
		.map(profile => profile.rawCol);

	return {
		id: "layout:groupedSweep",
		layoutKind: "groupedSweep",
		confidence: 0.86,
		bindings: [{
			...createBaseBindingRange(structure),
			groupByCol: groupColumn?.rawCol,
			pointCol: pointColumn.rawCol,
			xCol: xColumn.rawCol,
			yCols: [yColumn.rawCol],
			biasCols: biasColumns,
		}],
		reasons: [
			"Detected a point/index column followed by numeric sweep and response columns.",
			"Earlier numeric columns can act as group keys.",
		],
	};
};

const detectWideMatrixLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	const numericProfiles = getNumericProfiles(columnProfiles);
	const xColumn = numericProfiles[0] ?? null;
	if (!xColumn || xColumn.rawCol !== 0) {
		return null;
	}

	const numericHeaderLabels = columnProfiles
		.slice(1)
		.filter(profile => parseFiniteNumber(profile.headerText) !== null);
	const yColumns = numericProfiles
		.filter(profile => profile.rawCol > xColumn.rawCol)
		.map(profile => profile.rawCol);
	if (numericHeaderLabels.length < 2 || yColumns.length < 2) {
		return null;
	}

	const confidence = clamp(0.88 + (xColumn.numericStats?.monotonicity ?? 0) * 0.06);
	return {
		id: "layout:wideMatrix",
		layoutKind: "wideMatrix",
		confidence,
		bindings: [{
			...createBaseBindingRange(structure),
			xCol: xColumn.rawCol,
			yCols: yColumns,
		}],
		reasons: [
			"Detected numeric series labels across the header row.",
			"First numeric column can act as the matrix X axis.",
		],
	};
};

const detectTimeSeriesLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	const numericProfiles = getNumericProfiles(columnProfiles);
	const xColumn = numericProfiles.find(profile =>
		isNumericProfile(profile) &&
		isTimeHeader(profile.headerText)
	) ?? null;
	if (!xColumn || xColumn.rawCol !== numericProfiles[0]?.rawCol) {
		return null;
	}

	const yColumns = numericProfiles
		.filter(profile => profile.rawCol !== xColumn.rawCol)
		.map(profile => profile.rawCol);
	if (!yColumns.length) {
		return null;
	}

	const confidence = clamp(0.84 + (xColumn.numericStats?.monotonicity ?? 0) * 0.06);
	return {
		id: "layout:timeSeries",
		layoutKind: "timeSeries",
		confidence,
		bindings: [{
			...createBaseBindingRange(structure),
			xCol: xColumn.rawCol,
			yCols: yColumns,
		}],
		reasons: [
			"Detected a time-like numeric X column.",
			"Remaining numeric columns can be treated as response series.",
		],
	};
};

const detectPairwiseXYLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	if (columnProfiles.some(profile => isPointHeader(profile.headerText))) {
		return null;
	}

	const numericProfiles = getNumericProfiles(columnProfiles);
	if (numericProfiles.length < 4 || numericProfiles.length % 2 !== 0) {
		return null;
	}

	const pairs: LayoutBindingDraft[] = [];
	for (let index = 0; index < numericProfiles.length - 1; index += 2) {
		const xColumn = numericProfiles[index];
		const yColumn = numericProfiles[index + 1];
		if (!xColumn || !yColumn || yColumn.rawCol !== xColumn.rawCol + 1) {
			return null;
		}

		pairs.push({
			...createBaseBindingRange(structure),
			xCol: xColumn.rawCol,
			yCols: [yColumn.rawCol],
		});
	}

	if (pairs.length < 2) {
		return null;
	}

	const monotonicScore = getAverage(
		pairs.map(pair => getProfile(columnProfiles, pair.xCol)?.numericStats?.monotonicity ?? 0),
	);
	const confidence = clamp(0.82 + monotonicScore * 0.08);
	return {
		id: "layout:pairwiseXY",
		layoutKind: "pairwiseXY",
		confidence,
		bindings: pairs,
		reasons: [
			"Detected repeated adjacent numeric X/Y column pairs.",
			"X columns are regular enough for layout prefill.",
		],
	};
};

const detectSharedXMultiYLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	const binding = createSharedNumericBinding(columnProfiles, structure);
	if (!binding || (binding.yCols?.length ?? 0) < 2) {
		return null;
	}

	const xProfile = getProfile(columnProfiles, binding.xCol);
	const confidence = clamp(0.76 + (xProfile?.numericStats?.monotonicity ?? 0) * 0.08);
	return {
		id: "layout:sharedXMultiY",
		layoutKind: "sharedXMultiY",
		confidence,
		bindings: [binding],
		reasons: [
			"Detected one numeric X column shared by multiple numeric Y columns.",
		],
	};
};

const detectSimpleXYLayout = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutCandidate | null => {
	const binding = createSharedNumericBinding(columnProfiles, structure);
	if (!binding || (binding.yCols?.length ?? 0) !== 1) {
		return null;
	}

	const xProfile = getProfile(columnProfiles, binding.xCol);
	const confidence = clamp(0.72 + (xProfile?.numericStats?.monotonicity ?? 0) * 0.08);
	return {
		id: "layout:simpleXY",
		layoutKind: "simpleXY",
		confidence,
		bindings: [binding],
		reasons: [
			"Detected one numeric X column and one numeric Y column.",
		],
	};
};

const createUnknownLayoutCandidate = (): LayoutCandidate => ({
	id: "layout:unknown",
	layoutKind: "unknown",
	confidence: 0,
	bindings: [],
	reasons: ["Could not identify a reliable table layout."],
});

const createSharedNumericBinding = (
	columnProfiles: readonly ColumnProfile[],
	structure: RawTableStructure,
): LayoutBindingDraft | null => {
	const numericProfiles = getNumericProfiles(columnProfiles);
	if (numericProfiles.length < 2) {
		return null;
	}

	const xColumn = chooseXColumn(numericProfiles);
	const yColumns = numericProfiles
		.filter(profile => profile.rawCol !== xColumn.rawCol)
		.map(profile => profile.rawCol);
	if (!yColumns.length) {
		return null;
	}

	return {
		...createBaseBindingRange(structure),
		xCol: xColumn.rawCol,
		yCols: yColumns,
	};
};

const createBaseBindingRange = (
	structure: RawTableStructure,
): LayoutBindingDraft => ({
	dataRange: structure.dataRegions[0]?.range,
	headerRange: structure.headerRows[0]?.range,
});

const chooseXColumn = (
	profiles: readonly ColumnProfile[],
): ColumnProfile => {
	let best = profiles[0] ?? null;
	for (const profile of profiles) {
		if (!best) {
			best = profile;
			continue;
		}
		const profileScore = getXColumnScore(profile);
		const bestScore = getXColumnScore(best);
		if (
			profileScore > bestScore ||
			(profileScore === bestScore && profile.rawCol < best.rawCol)
		) {
			best = profile;
		}
	}
	return best ?? profiles[0]!;
};

const chooseGroupColumn = (
	profiles: readonly ColumnProfile[],
): ColumnProfile | null => {
	let best: ColumnProfile | null = null;
	for (const profile of profiles) {
		if (!best) {
			best = profile;
			continue;
		}
		const profileScore = getGroupColumnScore(profile);
		const bestScore = getGroupColumnScore(best);
		if (
			profileScore > bestScore ||
			(profileScore === bestScore && profile.rawCol > best.rawCol)
		) {
			best = profile;
		}
	}
	return best;
};

const getGroupColumnScore = (
	profile: ColumnProfile,
): number => {
	const stats = profile.numericStats;
	if (!stats) {
		return 0;
	}
	return (stats.uniqueRatio * 0.7) + (stats.span > 0 ? 0.3 : 0);
};

const getXColumnScore = (
	profile: ColumnProfile,
): number => {
	const stats = profile.numericStats;
	if (!stats) {
		return 0;
	}
	return (stats.monotonicity * 0.6) +
		(stats.uniqueRatio * 0.3) +
		(stats.span > 0 ? 0.1 : 0);
};

const getNumericProfiles = (
	columnProfiles: readonly ColumnProfile[],
): readonly ColumnProfile[] =>
	columnProfiles.filter(isNumericProfile);

const isNumericProfile = (
	profile: ColumnProfile,
): boolean =>
	(profile.kind === "numeric" || profile.kind === "mixed") &&
	(profile.numericStats?.finiteCount ?? 0) > 0;

const isPointHeader = (
	value: string,
): boolean => {
	const compact = value
		.toLowerCase()
		.replace(/[\s_\-./()[\]{}:=`]+/g, "");
	return compact === "point" || compact === "index" || compact === "idx";
};

const isTimeHeader = (
	value: string,
): boolean => {
	const compact = value
		.toLowerCase()
		.replace(/[\s_\-./()[\]{}:=`]+/g, "");
	return compact === "time" || compact === "t" || compact === "timestamp";
};

const getProfile = (
	profiles: readonly ColumnProfile[],
	rawCol: number | undefined,
): ColumnProfile | undefined =>
	rawCol === undefined
		? undefined
		: profiles.find(profile => profile.rawCol === rawCol);

const getAverage = (
	values: readonly number[],
): number =>
	values.length
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: 0;

const clamp = (
	value: number,
): number =>
	Math.max(0, Math.min(1, value));
