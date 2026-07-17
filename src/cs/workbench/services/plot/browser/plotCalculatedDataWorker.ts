/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import type { CalculatedData } from 'src/cs/workbench/services/calculation/common/calculationReadModel';
import { createPlotDisplayModelFromCalculatedData } from 'src/cs/workbench/services/plot/browser/plotDisplayModel';
import type {
	PlotDisplayModel,
	PlotFileAxisSettings,
	PlotType,
} from 'src/cs/workbench/services/plot/common/plot';

export type PlotDisplayModelWorkerRequest = {
	readonly axisSettings?: PlotFileAxisSettings;
	readonly axisTitleOverridesByKey?: Readonly<Record<string, string>>;
	readonly calculatedData: CalculatedData;
	readonly fileId: string;
	readonly hiddenLegendKeys?: readonly string[];
	readonly includeInspector?: boolean;
	readonly legendLabels?: Readonly<Record<string, string>>;
	readonly plotType: PlotType;
	readonly requestId: number;
	readonly dataVersion: number;
};

export type PlotDisplayModelWorkerOutput = {
	readonly displayModel: PlotDisplayModel | null;
	readonly fileId: string;
	readonly plotType: PlotType;
	readonly requestId: number;
	readonly dataVersion: number;
};

export interface IPlotCalculatedDataWorker {
	$calculateDisplayModel(input: PlotDisplayModelWorkerRequest): PlotDisplayModelWorkerOutput;
}

class PlotCalculatedDataWorker implements IPlotCalculatedDataWorker {
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
			dataVersion: normalizeInteger(input.dataVersion),
		};
	}
}

bootstrapWebWorker(() => new PlotCalculatedDataWorker());

function normalizeInteger(value: number): number {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) ? normalized : 0;
}
