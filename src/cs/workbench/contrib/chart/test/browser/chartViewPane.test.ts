/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import { CHART_LEGEND_ACTION_ID } from "src/cs/workbench/contrib/chart/browser/chartActions";
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
	PlotLegendModel,
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

	test("keeps a single header action group after committing a legend edit", async () => {
		if (typeof document === "undefined") {
			return;
		}

		const input = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			hasChartData: true,
		});
		const chartService = createChartServiceForTest(input);
		const plotService = createPlotServiceForLegendEditTest();
		const pane = store.add(new ChartViewPane(
			chartService,
			createChartTitleEditServiceForTest(),
			createCommandServiceForTest(chartService, []),
			createExplorerServiceForTest(),
			plotService,
			createSettingsServiceForTest(),
		));

		try {
			assert.equal(pane.element.querySelectorAll(".chart_view_detail_actions").length, 1);

			const legendButton = pane.element.querySelector<HTMLButtonElement>(
				`button[data-action-id="${CHART_LEGEND_ACTION_ID}"]`,
			);
			assert.ok(legendButton);
			legendButton.click();
			await Promise.resolve();

			const editButton = pane.element.querySelector<HTMLButtonElement>(".chart_legend_edit");
			assert.ok(editButton);
			editButton.click();
			await Promise.resolve();

			const inputElement = pane.element.querySelector<HTMLInputElement>(".chart_legend_inline_input");
			assert.ok(inputElement);
			inputElement.value = "Edited";
			inputElement.dispatchEvent(new Event("input", { bubbles: true }));
			inputElement.dispatchEvent(new KeyboardEvent("keydown", {
				bubbles: true,
				key: "Enter",
			}));
			await Promise.resolve();

			assert.equal(plotService.getLegendLabels("file-a")["series-a"], "Edited");
			assert.equal(pane.element.querySelectorAll(".chart_view_detail_actions").length, 1);
			assert.equal(pane.element.querySelectorAll(`button[data-action-id="${CHART_LEGEND_ACTION_ID}"]`).length, 1);
		} finally {
			pane.dispose();
		}
	});

	test("opens the legend from the chart display model while the legend cache is pending", async () => {
		if (typeof document === "undefined") {
			return;
		}

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
			createCommandServiceForTest(chartService, []),
			createExplorerServiceForTest(),
			createPlotServiceForTest([]),
			createSettingsServiceForTest(),
		));

		try {
			const legendButton = pane.element.querySelector<HTMLButtonElement>(
				`button[data-action-id="${CHART_LEGEND_ACTION_ID}"]`,
			);
			assert.ok(legendButton);
			assert.equal(legendButton.disabled, false);

			legendButton.click();
			await Promise.resolve();

			assert.ok(pane.element.querySelector(".chart_legend"));
		} finally {
			pane.dispose();
		}
	});

	test("keeps chart-owned header action controls mounted while inspector data is processing", async () => {
		if (typeof document === "undefined") {
			return;
		}

		const input = createChartViewInput({
			activeFileId: "file-a",
			activePlotType: "iv",
			chartFileOptions: [{ fileId: "file-a", fileName: "file-a.csv" }],
			hasChartData: true,
		});
		const chartService = createChartServiceForTest(input);
		chartService.toggleDetailPane("inspector");
		const plotService = createPlotServiceForHeaderStabilityTest();
		const pane = store.add(new ChartViewPane(
			chartService,
			createChartTitleEditServiceForTest(),
			createCommandServiceForTest(chartService, []),
			createExplorerServiceForTest(),
			plotService,
			createSettingsServiceForTest(),
		));

		try {
			const actionBar = pane.element.querySelector<HTMLElement>(".chart_view_detail_actions");
			const legendButton = pane.element.querySelector<HTMLButtonElement>(
				`button[data-action-id="${CHART_LEGEND_ACTION_ID}"]`,
			);
			const inspectorButton = pane.element.querySelector<HTMLButtonElement>(
				"button[aria-label='chart.inspector.heading']",
			);
			assert.ok(actionBar);
			assert.ok(legendButton);
			assert.ok(inspectorButton);

			plotService.firePlotStateChange();
			await Promise.resolve();

			assert.strictEqual(pane.element.querySelector(".chart_view_detail_actions"), actionBar);
			assert.strictEqual(
				pane.element.querySelector(`button[data-action-id="${CHART_LEGEND_ACTION_ID}"]`),
				legendButton,
			);
			assert.strictEqual(
				pane.element.querySelector("button[aria-label='chart.inspector.heading']"),
				inspectorButton,
			);
			assert.equal(pane.element.querySelectorAll(".chart_view_detail_actions").length, 1);
			assert.equal(pane.element.querySelectorAll(`button[data-action-id="${CHART_LEGEND_ACTION_ID}"]`).length, 1);
		} finally {
			pane.dispose();
		}
	});
});

const createChartServiceForTest = (
	input: ReturnType<typeof createChartViewInput>,
): IChartService => {
	const onDidChangeChartStateEmitter = new Emitter<ChartState>();
	let visibleDetailPanes: readonly ChartDetailPane[] = [];
	let legendPopoverContextKey: string | null = null;
	const getState = (): ChartState => ({
		legendPopoverContextKey,
		visibleDetailPanes,
	});

	return {
		_serviceBrand: undefined,
		getState,
		getViewInput: () => input,
		onDidChangeChartState: onDidChangeChartStateEmitter.event,
		onDidChangeChartViewInput: Event.None,
		setLegendPopoverContextKey: (contextKey) => {
			legendPopoverContextKey = contextKey;
			onDidChangeChartStateEmitter.fire(getState());
		},
		toggleDetailPane: (pane) => {
			visibleDetailPanes = visibleDetailPanes.includes(pane) ? [] : [pane];
			onDidChangeChartStateEmitter.fire(getState());
		},
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
	getHiddenLegendKeys: () => [],
	getLegendLabels: () => ({}),
	getState: () => ({
		activePlotType: "iv",
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabelsByFileId: {},
	}),
	onDidChangeCalculatedDataCache: Event.None,
	onDidChangePlotDisplayModelCache: Event.None,
	onDidChangePlotState: Event.None,
	prefetchCalculatedData: () => undefined,
	prefetchPlotDisplayModel: () => undefined,
	prefetchPlotInspectorDisplayModel: (request, priority) => {
		prefetches.push(`${request.fileId}:${priority}`);
	},
	setAxisTitleOverride: () => undefined,
	setActivePlotType: () => undefined,
	setLegendLabel: () => undefined,
	toggleHiddenLegendKey: () => undefined,
	setYScale: async () => undefined,
	setAxisUnit: async () => undefined,
} as unknown as IPlotService);

const createPlotServiceForLegendEditTest = (): IPlotService => {
	const onDidChangePlotStateEmitter = new Emitter<ReturnType<IPlotService["getState"]>>();
	let legendLabelsByFileId: Readonly<Record<string, Readonly<Record<string, string>>>> = {};
	const getState = () => ({
		activePlotType: "iv" as const,
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabelsByFileId,
	});
	return {
		_serviceBrand: undefined,
		cancelQueuedPlotInspectorDisplayModelPrefetch: () => undefined,
		getCachedPlotDisplayModel: () => createPlotDisplayModel(),
		getCachedPlotLegendModel: () => createPlotLegendModel(),
		getHiddenLegendKeys: () => [],
		getLegendLabels: (fileId) => legendLabelsByFileId[fileId] ?? {},
		getState,
		onDidChangeCalculatedDataCache: Event.None,
		onDidChangePlotDisplayModelCache: Event.None,
		onDidChangePlotState: onDidChangePlotStateEmitter.event,
		prefetchCalculatedData: () => undefined,
		prefetchPlotDisplayModel: () => undefined,
		prefetchPlotInspectorDisplayModel: () => undefined,
		setAxisTitleOverride: () => undefined,
		setActivePlotType: () => undefined,
		setLegendLabel: (fileId, seriesId, label) => {
			legendLabelsByFileId = label
				? {
					...legendLabelsByFileId,
					[fileId]: {
						...(legendLabelsByFileId[fileId] ?? {}),
						[seriesId]: label,
					},
				}
				: {};
			onDidChangePlotStateEmitter.fire(getState());
		},
		toggleHiddenLegendKey: () => undefined,
		setYScale: async () => undefined,
		setAxisUnit: async () => undefined,
	} as unknown as IPlotService;
};

const createPlotServiceForHeaderStabilityTest = (): IPlotService & {
	readonly firePlotStateChange: () => void;
} => {
	const onDidChangePlotStateEmitter = new Emitter<ReturnType<IPlotService["getState"]>>();
	const getState = () => ({
		activePlotType: "iv" as const,
		axisTitleOverridesByKey: {},
		hiddenLegendKeysByPlotKey: {},
		legendLabelsByFileId: {},
	});
	return {
		_serviceBrand: undefined,
		cancelQueuedPlotInspectorDisplayModelPrefetch: () => undefined,
		firePlotStateChange: () => onDidChangePlotStateEmitter.fire(getState()),
		getCachedPlotDisplayModel: () => createPlotDisplayModel(),
		getCachedPlotLegendModel: () => createPlotLegendModel(),
		getHiddenLegendKeys: () => [],
		getLegendLabels: () => ({}),
		getState,
		onDidChangeCalculatedDataCache: Event.None,
		onDidChangePlotDisplayModelCache: Event.None,
		onDidChangePlotState: onDidChangePlotStateEmitter.event,
		prefetchCalculatedData: () => undefined,
		prefetchPlotDisplayModel: () => undefined,
		prefetchPlotInspectorDisplayModel: () => undefined,
		setAxisTitleOverride: () => undefined,
		setActivePlotType: () => undefined,
		setLegendLabel: () => undefined,
		toggleHiddenLegendKey: () => undefined,
		setYScale: async () => undefined,
		setAxisUnit: async () => undefined,
	} as unknown as IPlotService & {
		readonly firePlotStateChange: () => void;
	};
};

const createPlotDisplayModel = (): PlotDisplayModel => ({
	chart: createPlotPaneDisplayModel("chart"),
	fileId: "file-a",
	inspector: null,
	plotType: "iv",
	unitControl: null,
});

const createPlotLegendModel = (): PlotLegendModel => ({
	fileId: "file-a",
	plotType: "iv",
	seriesList: createPlotModel().seriesList,
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
