/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	createCalculatedDataForFile,
	type CalculatedData,
	type CalculationSourceFile,
	type CalculationSourceSeries,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type {
	CalculationKind,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
import {
	collectFileRecordBaseCurves,
	fileRecordSupportsSs,
	getFileRecordAxisProjection,
	getFileRecordCurveType,
	getFileRecordDomain,
	getFileRecordXGroups,
} from "src/cs/workbench/services/session/common/sessionFileProjection";
import type {
	FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export function createCalculatedDataForCanonicalFile({
	file,
	plotType,
}: {
	readonly file: FileRecord;
	readonly plotType: CalculationKind;
}): CalculatedData {
	return createCalculatedDataForFile({
		file: createCalculationSourceFile(file),
		fileId: file.id,
		inputKind: "canonical",
		plotType,
	});
}

function createCalculationSourceFile(file: FileRecord): CalculationSourceFile {
	const axis = getFileRecordAxisProjection(file);
	const domain = getFileRecordDomain(file);
	return {
		curveType: getFileRecordCurveType(file),
		domain: domain
			? {
				x: domain.x,
				y: domain.y,
			}
			: undefined,
		fileId: file.id,
		fileName: file.raw.fileName,
		series: createCalculationSourceSeries(file),
		supportsSs: fileRecordSupportsSs(file),
		xAxisRole: axis.xAxisRole,
		xGroups: getFileRecordXGroups(file),
		xLabel: axis.xLabel,
		xUnit: axis.xUnit,
		yLabel: axis.yLabel,
		yUnit: axis.yUnit,
	};
}

function createCalculationSourceSeries(
	file: FileRecord,
): CalculationSourceSeries[] {
	return collectFileRecordBaseCurves(file).map((curve, index) => {
		const series = file.seriesById[curve.seriesId];
		return {
			groupIndex: index,
			id: curve.seriesId || `series-${index + 1}`,
			legendValue: series?.legendValue,
			name: series?.labelOverride ??
				series?.legendValue ??
				series?.name ??
				`Series ${index + 1}`,
			y: curve.points.map(point => point.y),
			yCol: Number.isInteger(Number(series?.yCol))
				? series?.yCol
				: index + 1,
		};
	});
}
