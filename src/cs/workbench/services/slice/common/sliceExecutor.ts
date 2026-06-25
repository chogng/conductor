/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	BaseCurveFamily,
	CurveKey,
	CurveRecord,
	ItCurveMode,
	IvCurveMode,
	SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
	SliceCommit,
	SlicePlan,
	SliceRun,
} from "src/cs/workbench/services/slice/common/slice";

export type ExecuteSlicePlanInput = {
	readonly plan: SlicePlan;
	readonly rows: readonly (readonly unknown[])[];
};

export const executeSlicePlan = ({
	plan,
	rows,
}: ExecuteSlicePlanInput): SliceCommit => {
	const series: SeriesRecord[] = [];
	const curves: CurveRecord[] = [];
	const warnings: string[] = [];
	const errors: string[] = [...plan.errors];
	const measurement = plan.measurement;
	if (!measurement) {
		errors.push("sliceExecutor.missingMeasurementBinding");
	}

	for (const block of plan.blocks) {
		const xColumn = block.xColumns[0];
		if (typeof xColumn !== "number") {
			warnings.push("sliceExecutor.missingXColumn");
			continue;
		}

		for (const yColumn of block.yColumns) {
			const points = readCurvePoints(rows, block.inputRange.range.startRow, block.inputRange.range.endRow, xColumn, yColumn);
			if (!points.length) {
				warnings.push("sliceExecutor.emptySeries");
				continue;
			}

			const seriesId = createSliceSeriesId(block.blockIndex, yColumn);
			series.push({
				fileId: plan.ref.fileId,
				sheetId: plan.ref.rawTableId,
				id: seriesId,
				name: plan.template.name,
				groupIndex: block.blockIndex,
				yCol: yColumn,
				y: points.map(point => point.y),
			});
			if (measurement) {
				curves.push(createBaseCurve({
					curveFamily: measurement.curveFamily,
					fileId: plan.ref.fileId,
					itMode: measurement.itMode,
					ivMode: measurement.ivMode,
					points,
					seriesId,
					templateFingerprint: plan.templateFingerprint,
				}));
			}
		}
	}

	if (!curves.length && !errors.length) {
		errors.push("sliceExecutor.noCurves");
	}

	const outputSeriesIds = series.map(entry => entry.id);
	const outputCurveKeys = curves.map(createCurveRecordKey);
	return {
		run: {
			id: createSliceRunId(plan),
			fileId: plan.ref.fileId,
			rawTableId: plan.ref.rawTableId,
			mode: plan.mode,
			selection: plan.selection,
			sourceRawTableVersion: plan.sourceRawTableVersion,
			sourceTableModelSignature: plan.sourceTableModelSignature,
			template: plan.template,
			templateFingerprint: plan.templateFingerprint,
			inputRanges: plan.inputRanges,
			outputSeriesIds,
			outputCurveKeys,
			warnings,
			errors,
		},
		series,
		curves,
	};
};

const readCurvePoints = (
	rows: readonly (readonly unknown[])[],
	startRow: number,
	endRow: number,
	xColumn: number,
	yColumn: number,
): Array<{ readonly x: number; readonly y: number }> => {
	const points: Array<{ readonly x: number; readonly y: number }> = [];
	for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
		const row = rows[rowIndex];
		if (!row) {
			continue;
		}
		const x = parseNumber(row[xColumn]);
		const y = parseNumber(row[yColumn]);
		if (x === null || y === null) {
			continue;
		}
		points.push({ x, y });
	}
	return points;
};

const createBaseCurve = ({
	curveFamily,
	fileId,
	itMode,
	ivMode,
	points,
	seriesId,
	templateFingerprint,
}: {
	readonly curveFamily: BaseCurveFamily;
	readonly fileId: string;
	readonly itMode?: ItCurveMode | null;
	readonly ivMode?: IvCurveMode | null;
	readonly points: Array<{ readonly x: number; readonly y: number }>;
	readonly seriesId: string;
	readonly templateFingerprint: string;
}): CurveRecord => ({
	fileId,
	seriesId,
	curveGeneration: "base",
	curveFamily,
	...(curveFamily === "iv" ? { ivMode: ivMode ?? "transfer" } : {}),
	...(curveFamily === "it" ? { itMode: itMode ?? "generic" } : {}),
	lineage: {
		curveGeneration: "base",
		baseFamily: curveFamily,
		...(curveFamily === "iv" ? { ivMode: ivMode ?? "transfer" } : {}),
		...(curveFamily === "it" ? { itMode: itMode ?? "generic" } : {}),
		baseSeries: {
			fileId,
			seriesId,
		},
	},
	points,
	signature: `slice:${templateFingerprint}:${seriesId}:${points.length}`,
});

const createCurveRecordKey = (curve: CurveRecord): CurveKey => {
	if (curve.curveGeneration !== "base") {
		throw new Error("Slice executor only emits base curves.");
	}

	const mode = curve.curveFamily === "iv"
		? curve.ivMode ?? "default"
		: curve.curveFamily === "it"
			? curve.itMode ?? "default"
			: "default";
	return `base:${curve.curveFamily}:${mode}:${curve.seriesId}` as CurveKey;
};

const createSliceSeriesId = (
	blockIndex: number,
	yColumn: number,
): string => `series-b${blockIndex}-y${yColumn}`;

const createSliceRunId = (
	plan: SlicePlan,
): SliceRun["id"] =>
	`slice:${plan.ref.fileId}:${plan.ref.rawTableId}:${plan.templateFingerprint}:${plan.sourceRawTableVersion}`;

const parseNumber = (value: unknown): number | null => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	const text = String(value ?? "").trim();
	if (!text) {
		return null;
	}

	const parsed = Number(text);
	return Number.isFinite(parsed) ? parsed : null;
};
