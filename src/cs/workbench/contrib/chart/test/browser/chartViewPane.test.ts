/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import { ChartViewPane } from "src/cs/workbench/contrib/chart/browser/chartViewPane";
import type { IChartTitleEditService } from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import type { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import type {
	ChartDetailPane,
	ChartState,
	IChartService,
	TOGGLE_CHART_INSPECTOR_COMMAND_ID,
} from "src/cs/workbench/services/chart/common/chart";
import type {
	IPlotService,
	PlotDisplayModel,
	PlotPaneDisplayModel,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";

suite("workbench/contrib/chart/test/browser/chartViewPane", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("prefetches inspector only after the pane is opened in the current run", async () => {
		if (typeof document === "undefined") {
			return;
		}

		const originalSetTimeout = globalThis.setTimeout;
		const originalClearTimeout = globalThis.clearTimeout;
		let pendingTimeout: (() => void) | null = null;
		globalThis.setTimeout = ((handler: TimerHandler) => {
			pendingTimeout = () => {
				if (typeof handler === "function") {
					handler();
				}
			};
			return 1;
		}) as typeof globalThis.setTimeout;
		globalThis.clearTimeout = (() => {
			pendingTimeout = null;
		}) as typeof globalThis.clearTimeout;

		const prefetches: string[] = [];
		const commandIds: string[] = [];
		const input = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			hasChartData: true,
		});
		const chartService = createChartServiceForTest(input);
		const pane = store.add(new ChartViewPane(
			chartService,
			createChartTitleEditServiceForTest(),
			createCommandServiceForTest(chartService, commandIds),
			createExplorerServiceForTest(),
			createPlotServiceForTest(prefetches),
			createSettingsServiceForTest(),
		));

		try {
			assert.deepEqual(chartService.getState().visibleDetailPanes, []);
			assert.equal(pendingTimeout, null);
			assert.deepEqual(commandIds, []);
			assert.deepEqual(prefetches, []);

			const inspectorButton = pane.element.querySelector<HTMLButtonElement>(
				"button[aria-label='chart.inspector.heading']",
			);
			assert.ok(inspectorButton);
			inspectorButton.click();
			await Promise.resolve();

			assert.deepEqual(chartService.getState().visibleDetailPanes, ["inspector"]);
			assert.deepEqual(commandIds, [TOGGLE_CHART_INSPECTOR_COMMAND_ID]);
			assert.notEqual(pendingTimeout, null);

			pendingTimeout?.();

			assert.deepEqual(prefetches, ["file-a:active"]);
		} finally {
			pane.dispose();
			globalThis.setTimeout = originalSetTimeout;
			globalThis.clearTimeout = originalClearTimeout;
		}
	});
});

const createChartServiceForTest = (
	input: ReturnType<typeof createChartViewInput>,
): IChartService => {
	const onDidChangeChartStateEmitter = new Emitter<ChartState>();
	let visibleDetailPanes: readonly ChartDetailPane[] = [];
	const getState = (): ChartState => ({
		hiddenLegendKeysByContext: {},
		legendPopoverContextKey: null,
		visibleDetailPanes,
	});

	return {
		_serviceBrand: undefined,
		getHiddenLegendKeys: () => [],
		getState,
		getViewInput: () => input,
		onDidChangeChartState: onDidChangeChartStateEmitter.event,
		onDidChangeChartViewInput: Event.None,
		setLegendPopoverContextKey: () => undefined,
		toggleDetailPane: (pane) => {
			visibleDetailPanes = visibleDetailPanes.includes(pane) ? [] : [pane];
			onDidChangeChartStateEmitter.fire(getState());
		},
		toggleHiddenLegendKey: () => undefined,
		updateViewInput: () => undefined,
	};
};

const createChartTitleEditServiceForTest = (): IChartTitleEditService => ({
	_serviceBrand: undefined,
	editAxisTitle: () => false,
	registerHandler: () => ({ dispose: () => undefined }),
});

const createCommandServiceForTest = (
	chartService: IChartService,
	commandIds: string[],
): ICommandService => ({
	_serviceBrand: undefined,
	executeCommand: async <R = unknown>(commandId: string): Promise<R | undefined> => {
		commandIds.push(commandId);
		if (commandId === TOGGLE_CHART_INSPECTOR_COMMAND_ID) {
			chartService.toggleDetailPane("inspector");
		}

		return undefined;
	},
	onDidExecuteCommand: Event.None as Event<ICommandEvent>,
	onWillExecuteCommand: Event.None as Event<ICommandEvent>,
});

const createExplorerServiceForTest = (): IExplorerService => ({
	select: () => null,
} as unknown as IExplorerService);

const createSettingsServiceForTest = (): ISettingsService => ({
	getConductorSettings: () => undefined,
	onDidChangeConductorSettings: Event.None,
} as unknown as ISettingsService);

const createPlotServiceForTest = (
	prefetches: string[],
): IPlotService => ({
	_serviceBrand: undefined,
	cancelQueuedPlotInspectorDisplayModelPrefetch: () => undefined,
	getCachedPlotDisplayModel: () => createPlotDisplayModel(),
	getCachedPlotLegendModel: () => null,
	getLegendLabels: () => ({}),
	getState: () => ({
		activePlotType: "iv",
		axisTitleOverridesByKey: {},
		legendLabelsByFileId: {},
	}),
	onDidChangeCalculatedDataCache: Event.None,
	onDidChangePlotDisplayModelCache: Event.None,
	onDidChangePlotState: Event.None,
	prefetchPlotDisplayModel: () => undefined,
	prefetchPlotInspectorDisplayModel: (request, priority) => {
		prefetches.push(`${request.fileId}:${priority}`);
	},
	setAxisTitleOverride: () => undefined,
	setActivePlotType: () => undefined,
	setLegendLabel: () => undefined,
	setYScale: async () => undefined,
	setAxisUnit: async () => undefined,
} as unknown as IPlotService);

const createPlotDisplayModel = (): PlotDisplayModel => ({
	chart: createPlotPaneDisplayModel("chart"),
	fileId: "file-a",
	inspector: null,
	plotType: "iv",
	unitControl: null,
});

const createPlotPaneDisplayModel = (
	pane: "chart" | "inspector",
): PlotPaneDisplayModel => ({
	defaultXAxisTitle: "Vd",
	defaultYAxisTitle: "Id",
	model: createPlotModel(),
	plotXFactor: 1,
	plotXUnitLabel: "V",
	plotYFactor: 1,
	plotYUnitLabel: "A",
	xAxisTitle: "Vd",
	xAxisTitleContext: {
		axis: "x",
		fileId: "file-a",
		pane,
		plotType: "iv",
	},
	yAxisTitle: "Id",
	yAxisTitleContext: {
		axis: "y",
		fileId: "file-a",
		pane,
		plotType: "iv",
	},
	yScaleMode: "linear",
});

const createPlotModel = (): PlotMainRenderModel => ({
	axisLabels: {
		xLabel: "Vd",
		yLabel: "Id",
	},
	pointsCount: 2,
	seriesList: [{
		data: [
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		],
		id: "series-a",
		name: "Series A",
	}],
	xDomain: [0, 1],
	xUnitLabel: "V",
	yDomain: [0, 1],
	yUnitLabel: "A",
});
