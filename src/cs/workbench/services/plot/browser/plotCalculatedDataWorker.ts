/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import { hasFileRecordBaseCurves } from 'src/cs/workbench/services/calculation/common/canonicalFileProjection';
import {
	createCalculatedDataForFile,
	type CalculatedData,
} from 'src/cs/workbench/services/calculation/common/calculationReadModel';
import { createPlotDisplayModelFromCalculatedData } from 'src/cs/workbench/services/plot/browser/plotDisplayModel';
import type {
	PlotDisplayModel,
	PlotFileAxisSettings,
	PlotType,
} from 'src/cs/workbench/services/plot/common/plot';
import type {
	FileId,
	FileRecord,
} from 'src/cs/workbench/services/session/common/sessionModel';

export type PlotCalculatedDataWorkerRequest = {
	readonly file: FileRecord;
	readonly fileId: FileId;
	readonly plotType: PlotType;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export type PlotCalculatedDataWorkerOutput = {
	readonly calculatedData: CalculatedData | null;
	readonly fileId: FileId;
	readonly plotType: PlotType;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export type PlotDisplayModelWorkerRequest = {
	readonly axisSettings?: PlotFileAxisSettings;
	readonly axisTitleOverridesByKey?: Readonly<Record<string, string>>;
	readonly calculatedData: CalculatedData;
	readonly fileId: FileId;
	readonly hiddenLegendKeys?: readonly string[];
	readonly includeInspector?: boolean;
	readonly legendLabels?: Readonly<Record<string, string>>;
	readonly plotType: PlotType;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export type PlotDisplayModelWorkerOutput = {
	readonly displayModel: PlotDisplayModel | null;
	readonly fileId: FileId;
	readonly plotType: PlotType;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export interface IPlotCalculatedDataWorker {
	$calculateData(input: PlotCalculatedDataWorkerRequest): PlotCalculatedDataWorkerOutput;
	$calculateDisplayModel(input: PlotDisplayModelWorkerRequest): PlotDisplayModelWorkerOutput;
}

class PlotCalculatedDataWorker implements IPlotCalculatedDataWorker {
	public $calculateData(
		input: PlotCalculatedDataWorkerRequest,
	): PlotCalculatedDataWorkerOutput {
		const file = input.file;
		const fileId = String(input.fileId ?? file?.id ?? '').trim();
		const plotType = input.plotType;
		if (!file || !fileId || !plotType) {
			throw new Error('Plot worker request is missing file or plot type.');
		}

		return {
			calculatedData: hasFileRecordBaseCurves(file)
				? createCalculatedDataForFile({ file, plotType })
				: null,
			fileId,
			plotType,
			requestId: normalizeInteger(input.requestId),
			sessionVersion: normalizeInteger(input.sessionVersion),
		};
	}

	public $calculateDisplayModel(
		input: PlotDisplayModelWorkerRequest,
	): PlotDisplayModelWorkerOutput {
		const calculatedData = input.calculatedData;
		const fileId = String(input.fileId ?? calculatedData?.source.fileId ?? '').trim();
		const plotType = input.plotType ?? calculatedData?.kind;
		if (!calculatedData || !fileId || !plotType) {
			throw new Error('Plot worker display request is missing file or plot type.');
		}

		return {
			displayModel: createPlotDisplayModelFromCalculatedData({
				axisSettings: input.axisSettings,
				axisTitleOverridesByKey: input.axisTitleOverridesByKey,
				calculatedData,
				hiddenLegendKeys: input.hiddenLegendKeys,
				includeInspector: input.includeInspector,
				legendLabels: input.legendLabels,
			}),
			fileId,
			plotType,
			requestId: normalizeInteger(input.requestId),
			sessionVersion: normalizeInteger(input.sessionVersion),
		};
	}
}

bootstrapWebWorker(() => new PlotCalculatedDataWorker());

function normalizeInteger(value: number): number {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) ? normalized : 0;
}
