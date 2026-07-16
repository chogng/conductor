/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CalculatedCurveRecord,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import type {
	CalculationBaseCurveRecord,
	CalculationMetricInputRecord,
	CalculationRecordsInput,
	CalculationSeriesRecord,
} from "src/cs/workbench/services/calculation/common/calculationRecords";
import { getFileRecordAxisProjection } from "src/cs/workbench/services/session/common/sessionFileProjection";
import type {
	CurveRecord,
	FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export function createCalculationRecordsInputForTest(
	file: FileRecord,
): CalculationRecordsInput {
	const baseCurvesByKey = Object.fromEntries(
		Object.entries(file.curvesByKey)
			.flatMap(([key, curve]) => {
				if (curve.curveGeneration !== "base") {
					return [];
				}
				return [[
					key,
					{
						channels: curve.channels,
						curveFamily: curve.curveFamily,
						curveGeneration: "base",
						domain: curve.domain,
						itMode: curve.itMode ?? null,
						ivMode: curve.ivMode ?? null,
						lineage: {
							baseFamily: curve.curveFamily,
							baseSeries: { seriesId: curve.seriesId },
							curveGeneration: "base",
							itMode: curve.itMode ?? null,
							ivMode: curve.ivMode ?? null,
						},
						points: curve.points,
						seriesId: curve.seriesId,
						signature: curve.signature,
					} satisfies CalculationBaseCurveRecord,
				] as const];
			}),
	);
	const metricInputsByKey = Object.fromEntries(
		Object.entries(file.metricInputsByKey ?? {}).map(([key, input]) => [
			key,
			{
				configSignature: input.configSignature,
				metricKey: input.metricKey,
				range: input.range,
				seriesId: input.seriesId,
				source: input.source,
				targets: input.targets,
			} satisfies CalculationMetricInputRecord,
		]),
	);
	const seriesById = Object.fromEntries(
		Object.entries(file.seriesById).map(([seriesId, series]) => [
			seriesId,
			{
				groupIndex: series.groupIndex,
				id: series.id,
				labelOverride: series.labelOverride,
				legendValue: series.legendValue,
				name: series.name,
				y: series.y,
				yCol: series.yCol,
			} satisfies CalculationSeriesRecord,
		]),
	);
	return {
		axis: getFileRecordAxisProjection(file),
		baseCurvesByKey,
		...(Object.keys(metricInputsByKey).length ? { metricInputsByKey } : {}),
		seriesById,
		seriesOrder: file.seriesOrder,
	};
}

export function createSessionCurveRecordsForTest(
	fileId: string,
	curves: readonly CalculatedCurveRecord[],
): CurveRecord[] {
	return curves.map(curve => {
		if (curve.curveGeneration === "derived") {
			return {
				...curve,
				fileId,
				lineage: {
					...curve.lineage,
					inputCurve: {
						...curve.lineage.inputCurve,
						fileId,
					},
				},
			};
		}
		return {
			...curve,
			fileId,
			lineage: {
				...curve.lineage,
				inputCurve: {
					...curve.lineage.inputCurve,
					fileId,
				},
			},
		};
	});
}
