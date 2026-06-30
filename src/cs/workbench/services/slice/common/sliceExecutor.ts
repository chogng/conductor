/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	SliceExecutionCurveRecord,
	SliceExecutionResult,
	SliceExecutionSeriesRecord,
	SliceBaseCurveFamily,
	SliceCurveKey,
	SliceItCurveMode,
	SliceIvCurveMode,
	SlicePlan,
} from "src/cs/workbench/services/slice/common/slice";

export type ExecuteSlicePlanInput = {
	readonly plan: SlicePlan;
	readonly rows: readonly (readonly unknown[])[];
};

export const executeSlicePlan = ({
	plan,
	rows,
}: ExecuteSlicePlanInput): SliceExecutionResult => {
	const series: SliceExecutionSeriesRecord[] = [];
	const curves: SliceExecutionCurveRecord[] = [];
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

			const seriesId = createSliceSeriesId(block.blockIndex, yColumn, block.segmentIndex);
			series.push({
				id: seriesId,
				name: plan.template.name,
				groupIndex: block.segmentIndex ?? block.blockIndex,
				yCol: yColumn,
				y: points.map(point => point.y),
			});
			if (measurement) {
				curves.push(createBaseCurve({
					curveFamily: measurement.curveFamily,
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
			mode: plan.mode,
			selection: plan.selection,
			sourceContentSignature: plan.sourceContentSignature,
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
	itMode,
	ivMode,
	points,
	seriesId,
	templateFingerprint,
}: {
	readonly curveFamily: SliceBaseCurveFamily;
	readonly itMode?: SliceItCurveMode | null;
	readonly ivMode?: SliceIvCurveMode | null;
	readonly points: Array<{ readonly x: number; readonly y: number }>;
	readonly seriesId: string;
	readonly templateFingerprint: string;
}): SliceExecutionCurveRecord => ({
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
			seriesId,
		},
	},
	points,
	signature: `slice:${templateFingerprint}:${seriesId}:${points.length}`,
});

const createCurveRecordKey = (curve: SliceExecutionCurveRecord): SliceCurveKey => {
	if (curve.curveGeneration !== "base") {
		throw new Error("Slice executor only emits base curves.");
	}

	const mode = curve.curveFamily === "iv"
		? curve.ivMode ?? "default"
		: curve.curveFamily === "it"
			? curve.itMode ?? "default"
			: "default";
	return `base:${curve.curveFamily}:${mode}:${curve.seriesId}` as SliceCurveKey;
};

const createSliceSeriesId = (
	blockIndex: number,
	yColumn: number,
	segmentIndex: number | undefined,
): string => segmentIndex === undefined
	? `series-b${blockIndex}-y${yColumn}`
	: `series-b${blockIndex}-s${segmentIndex}-y${yColumn}`;

const createSliceRunId = (
	plan: SlicePlan,
): string => {
	const targetId = `${getSliceRunResourceIdentity(plan.resource)}:${plan.sheetId ?? ""}`;
	return `slice:resource:${targetId}:${plan.templateFingerprint}:${plan.sourceVersion ?? 0}`;
};

const getSliceRunResourceIdentity = (
	resource: unknown,
): string => {
	const text = getSliceRunResourceString(resource);
	if (text) {
		return text.replace(/\\/g, "/");
	}

	if (resource && typeof resource === "object") {
		const candidate = resource as { readonly scheme?: unknown; readonly authority?: unknown; readonly path?: unknown; readonly query?: unknown; readonly fragment?: unknown };
		const scheme = String(candidate.scheme ?? "").trim();
		const path = String(candidate.path ?? "").trim();
		if (scheme && path) {
			const authority = String(candidate.authority ?? "").trim();
			const query = String(candidate.query ?? "").trim();
			const fragment = String(candidate.fragment ?? "").trim();
			return (scheme === "file"
				? `file://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
				: `${scheme}://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
			).replace(/\\/g, "/");
		}
	}

	return "";
};

const getSliceRunResourceString = (
	resource: unknown,
): string => {
	if (!resource) {
		return "";
	}

	if (typeof resource === "string") {
		return resource.trim();
	}

	const toString = (resource as { readonly toString?: unknown }).toString;
	if (typeof toString === "function" && toString !== Object.prototype.toString) {
		const text = String(toString.call(resource)).trim();
		return text === "[object Object]" ? "" : text;
	}

	return "";
};

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
