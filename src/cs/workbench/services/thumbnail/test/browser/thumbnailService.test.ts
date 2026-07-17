/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createCalculationResourceId } from "src/cs/workbench/services/calculation/common/calculation";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import {
	BrowserThumbnailPreviewService,
	BrowserThumbnailService,
} from "src/cs/workbench/services/thumbnail/browser/thumbnailService";
import { drawThumbnailBitmap } from "src/cs/workbench/services/thumbnail/browser/thumbnailBitmap";

suite("workbench/services/thumbnail/test/browser/thumbnailService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns thumbnail cache lifecycle", () => {
		const service = store.add(new BrowserThumbnailService());

		service.clear();

		assert.ok(true);
	});

	test("warms thumbnail bitmap cache without a connected canvas target", () => {
		if (typeof document === "undefined") {
			return;
		}

		const service = store.add(new BrowserThumbnailService());

		service.warmPlotThumbnail({
				model: {
					pointsCount: 2,
					seriesList: [{
						data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
					id: "series-a",
					name: "A",
				}],
				signature: "plot:file-a",
				xDomain: [0, 1],
				xUnitLabel: "V",
				yDomain: [0, 1],
				yUnitLabel: "A",
			},
			plotType: "iv",
		});

		assert.ok(true);
	});

	test("hover previews synchronously use PlotService when cache is cold and invalidate by resource", async () => {
		let cachedCalls = 0;
		let calculatedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (_input: PlotPreviewInput) => {
					cachedCalls += 1;
					return null;
				},
				getCalculatedData: (input: PlotPreviewInput) => {
					calculatedCalls += 1;
					const fileId = getPreviewInputId(input);
					return {
						fileId,
						signature: `plot:${fileId}`,
					};
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));
		const changedResources: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		assert.equal(service.get(createPreviewTarget("file-a")).kind, "idle");
		assert.equal(service.request(createPreviewTarget("file-a"), "hover").kind, "ready");
		assert.equal(cachedCalls, 1);
		assert.equal(calculatedCalls, 1);
		await timeout();
		assert.equal(service.get(createPreviewTarget("file-a")).kind, "ready");
		assert.equal(service.request(createPreviewTarget("file-a"), "hover").kind, "ready");
		assert.equal(cachedCalls, 1);
		assert.equal(calculatedCalls, 1);
		service.invalidate([createPreviewTarget("file-a")]);
		assert.equal(service.get(createPreviewTarget("file-a")).kind, "ready");
		assert.deepEqual(changedResources, [createPreviewTarget("file-a").resource.toString()]);
	});

	test("hover previews use cached Plot display models as fast thumbnails", () => {
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					const fileId = getPreviewInputId(input);
					return {
						activeFile: null,
						fileId,
						kind: "iv",
						pointsCount: 1,
						seriesList: [],
						signature: `calculated:${fileId}`,
						source: { fileId, inputKind: "record" },
						xDomain: [0, 1],
						xUnitLabel: "V",
						yDomain: [0, 1],
						yUnitLabel: "A",
					};
				},
				getCachedPlotDisplayModel: (input: PlotPreviewInput) => {
					const fileId = getPreviewInputId(input);
					return {
					chart: {
						defaultXAxisTitle: "x",
						defaultYAxisTitle: "y",
						model: {
							axisLabels: null,
							pointsCount: 1,
							seriesList: [{
								data: [{ x: 0, y: 0 }],
								id: "series-a",
								name: "A",
							}],
							xDomain: [0, 1],
							xUnitLabel: "V",
							yDomain: [0, 1],
							yUnitLabel: "A",
						},
						plotXFactor: 1,
						plotYFactor: 1,
						xAxisTitle: "x",
						xAxisTitleContext: { axis: "x", fileId, pane: "chart", plotType: "iv" },
						yAxisTitle: "y",
						yAxisTitleContext: { axis: "y", fileId, pane: "chart", plotType: "iv" },
						yScaleMode: "linear",
					},
					fileId,
					inspector: null,
					plotType: "iv",
					unitControl: null,
					};
				},
				getCalculatedData: () => {
					throw new Error("fast thumbnails should not synchronously calculate when display cache is warm");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
		));

		const state = service.request(createPreviewTarget("file-a"), "hover");

		assert.equal(state.kind, "fastReady");
		assert.equal(state.kind === "fastReady" ? state.signature : "", "calculated:file-a");
		assert.equal(state.kind === "fastReady" ? state.model.seriesList.length : 0, 1);
	});

	test("resource previews resolve directly from resource input", () => {
		const resourceInput = {
			resource: URI.file("/data/Uri.csv"),
			sheetId: "sheet-a",
		};
		const calculatedResources: Array<{
			readonly hasFileId: boolean;
			readonly resource?: string | null;
		}> = [];
		const displayPrefetches: Array<{
			readonly hasFileId: boolean;
			readonly resource?: string | null;
		}> = [];
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: () => null,
				getCalculatedData: (input: Parameters<IPlotService["getCalculatedData"]>[0]) => {
					calculatedResources.push({
						hasFileId: Object.prototype.hasOwnProperty.call(input, "fileId"),
						resource: input.resource?.toString() ?? null,
					});
					return {
						fileId: null,
						signature: "plot:uri-a",
					};
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchPlotDisplayModel: (input: Parameters<IPlotService["prefetchPlotDisplayModel"]>[0]) => {
					displayPrefetches.push({
						hasFileId: Object.prototype.hasOwnProperty.call(input, "fileId"),
						resource: input.resource?.toString() ?? null,
					});
				},
			} as unknown as IPlotService,
		));

		service.prefetch([resourceInput], "visible");

		assert.deepEqual(displayPrefetches, [{
			hasFileId: false,
			resource: "file:///data/Uri.csv",
		}]);
		assert.equal(service.request(resourceInput, "hover").kind, "ready");
		assert.deepEqual(calculatedResources, [{
			hasFileId: false,
			resource: "file:///data/Uri.csv",
		}]);
	});

	test("plot cache changes refresh matching previews without clearing resource previews", () => {
		const cacheEmitter = store.add(new Emitter<{
			readonly plotType: "iv";
			readonly resource: URI;
			readonly sheetId?: string | null;
		}>());
		const fileAInput = createPreviewTarget("file-a");
		const resourceInput = {
			resource: URI.file("/data/Uri.csv"),
			sheetId: "sheet-a",
		};
		let sessionBackedSignature = "plot:file-a:initial";
		const changedResources: string[] = [];
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					const fileId = getPreviewInputId(input);
					return {
						fileId,
						signature: fileId === "file-a" ? sessionBackedSignature : "plot:uri-a",
					};
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate cached plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: cacheEmitter.event,
				onDidChangePlotState: Event.None,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
		));
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		assert.equal(service.request(fileAInput, "hover").kind, "ready");
		assert.equal(service.request(resourceInput, "hover").kind, "ready");
		changedResources.length = 0;

		sessionBackedSignature = "plot:file-a:next";
		cacheEmitter.fire({ plotType: "iv", resource: fileAInput.resource });

		assert.equal(service.get(resourceInput).kind, "ready");
		assert.deepEqual(changedResources, [fileAInput.resource.toString()]);
	});

	test("fast thumbnails stay stable when full calculated data has the same signature", () => {
		const target = createPreviewTarget("file-a");
		const displayModelEmitter = new Emitter<{
			readonly plotType: string;
			readonly resource: URI;
		}>();
		let displayCacheWarm = true;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: createCalculatedDataForPreview,
				getCachedPlotDisplayModel: (input: PlotPreviewInput) =>
					displayCacheWarm ? createDisplayModelForPreview(input) : null,
				getCalculatedData: () => {
					throw new Error("fast thumbnail stability should not synchronously calculate");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotDisplayModelCache: displayModelEmitter.event,
				onDidChangePlotState: Event.None,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
		));
		const changedResources: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		assert.equal(service.request(target, "hover").kind, "fastReady");
		changedResources.length = 0;
		displayCacheWarm = false;
		displayModelEmitter.fire({ plotType: "iv", resource: target.resource });

		assert.equal(service.get(target).kind, "fastReady");
		assert.deepEqual(changedResources, []);
	});

	test("ready previews upgrade to fast thumbnails when display cache becomes warm", () => {
		const target = createPreviewTarget("file-a");
		const displayModelEmitter = new Emitter<{
			readonly plotType: string;
			readonly resource: URI;
		}>();
		let displayCacheWarm = false;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: createCalculatedDataForPreview,
				getCachedPlotDisplayModel: (input: PlotPreviewInput) =>
					displayCacheWarm ? createDisplayModelForPreview(input) : null,
				getCalculatedData: () => {
					throw new Error("ready thumbnail upgrade should not synchronously calculate");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotDisplayModelCache: displayModelEmitter.event,
				onDidChangePlotState: Event.None,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
		));
		const changedResources: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		assert.equal(service.request(target, "hover").kind, "ready");
		changedResources.length = 0;
		displayCacheWarm = true;
		displayModelEmitter.fire({ plotType: "iv", resource: target.resource });

		assert.equal(service.get(target).kind, "fastReady");
		assert.deepEqual(changedResources, [target.resource.toString()]);
	});

	test("hover request retries a cached loading preview", () => {
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					cachedCalls += 1;
					const fileId = getPreviewInputId(input);
					return modelReady
						? {
							fileId,
							signature: `plot:${fileId}`,
						}
						: null;
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));
		const changedResources: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		const target = createPreviewTarget("file-a");
		assert.equal(service.request(target, "nearby").kind, "loading");
		modelReady = true;

		assert.equal(service.request(target, "hover").kind, "ready");
		assert.equal(cachedCalls, 2);
		assert.deepEqual(changedResources, [
			target.resource.toString(),
			target.resource.toString(),
		]);
	});

	test("visible request queues a cached loading preview without synchronous retry", async () => {
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					cachedCalls += 1;
					const fileId = getPreviewInputId(input);
					return modelReady
						? {
							fileId,
							signature: `plot:${fileId}`,
						}
						: null;
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));

		assert.equal(service.request(createPreviewTarget("file-a"), "nearby").kind, "loading");
		modelReady = true;
		assert.equal(service.request(createPreviewTarget("file-a"), "visible").kind, "loading");
		assert.equal(cachedCalls, 1);

		await timeout();

		assert.equal(cachedCalls, 2);
		assert.equal(service.get(createPreviewTarget("file-a")).kind, "ready");
	});

	test("preview requests promote resource display prefetch priority when hover cannot synchronously resolve", async () => {
		const plotPrefetches: Array<{ resource: string; priority: string }> = [];
		const calculatedResources: Array<string | null> = [];
		let modelReady = false;
		const hoverTarget = { resource: URI.file("/workspace/hover-a.csv") };
		const visibleTarget = { resource: URI.file("/workspace/visible-a.csv") };
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: Parameters<IPlotService["getCachedCalculatedData"]>[0]) => {
					calculatedResources.push(input.resource?.toString() ?? null);
					return modelReady
						? {
							fileId: createCalculationResourceId(input.resource!, input.sheetId),
							signature: `plot:${input.resource?.toString()}`,
						}
						: null;
				},
				getCalculatedData: () => null,
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchPlotDisplayModel: (input: Parameters<IPlotService["prefetchPlotDisplayModel"]>[0], priority: string) => {
					plotPrefetches.push({ resource: input.resource?.toString() ?? "", priority });
				},
			} as unknown as IPlotService,
		));

		service.request(hoverTarget, "hover");
		service.prefetch([visibleTarget], "visible");

		assert.deepEqual(plotPrefetches, [
			{ resource: hoverTarget.resource.toString(), priority: "hover" },
			{ resource: visibleTarget.resource.toString(), priority: "visible" },
		]);
		assert.deepEqual(calculatedResources, [hoverTarget.resource.toString()]);

		modelReady = true;
		await timeout();

		assert.deepEqual(calculatedResources, [
			hoverTarget.resource.toString(),
			hoverTarget.resource.toString(),
			visibleTarget.resource.toString(),
		]);
	});

	test("preview prefetch runs through a deferred budgeted queue", async () => {
		const calculatedFileIds: string[] = [];
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					const fileId = getPreviewInputId(input);
					calculatedFileIds.push(fileId);
					return {
						fileId,
						signature: `plot:${fileId}`,
					};
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));

		service.prefetch([
			createPreviewTarget("file-a"),
			createPreviewTarget("file-b"),
		], "nearby");

		assert.deepEqual(calculatedFileIds, []);
		await timeout();

		assert.deepEqual(calculatedFileIds, ["file-a", "file-b"]);
		assert.equal(service.get(createPreviewTarget("file-a")).kind, "ready");
		assert.equal(service.get(createPreviewTarget("file-b")).kind, "ready");
	});

	test("preview prefetch processes visible then recent files before nearby backlog", async () => {
		const calculatedFileIds: string[] = [];
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					const fileId = getPreviewInputId(input);
					calculatedFileIds.push(fileId);
					return {
						fileId,
						signature: `plot:${fileId}`,
					};
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));

		service.prefetch([
			createPreviewTarget("nearby-a"),
			createPreviewTarget("nearby-b"),
			createPreviewTarget("nearby-c"),
			createPreviewTarget("nearby-d"),
		], "nearby");
		service.prefetch([createPreviewTarget("recent-a")], "recent");
		service.prefetch([createPreviewTarget("visible-a")], "visible");

		await timeout();

		assert.equal(calculatedFileIds[0], "visible-a");
		assert.equal(calculatedFileIds[1], "recent-a");
	});

	test("preview prefetch refreshes when plot cache becomes warm", async () => {
		const target = createPreviewTarget("file-a");
		const cacheEmitter = store.add(new Emitter<ThumbnailPlotCacheEventForTest>());
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					cachedCalls += 1;
					const fileId = getPreviewInputId(input);
					return modelReady
						? {
							fileId,
							signature: `plot:${fileId}`,
						}
						: null;
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: cacheEmitter.event,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));

		service.prefetch([target], "visible");

		await timeout();

		assert.equal(cachedCalls, 1);
		assert.equal(service.get(target).kind, "loading");

		modelReady = true;
		cacheEmitter.fire({ plotType: "iv", resource: target.resource });

		assert.equal(cachedCalls, 2);
		assert.equal(service.get(target).kind, "ready");
	});

	test("targeted plot cache changes retry loading hover previews", () => {
		const target = createPreviewTarget("file-a");
		const cacheEmitter = store.add(new Emitter<ThumbnailPlotCacheEventForTest>());
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					cachedCalls += 1;
					const fileId = getPreviewInputId(input);
					return modelReady
						? {
							fileId,
							signature: `plot:${fileId}`,
						}
						: null;
				},
				getCalculatedData: () => null,
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: cacheEmitter.event,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));
		const changedResources: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		assert.equal(service.request(target, "hover").kind, "loading");
		assert.equal(cachedCalls, 1);

		modelReady = true;
		cacheEmitter.fire({ plotType: "iv", resource: target.resource });

		assert.equal(service.get(target).kind, "ready");
		assert.equal(cachedCalls, 2);
		assert.deepEqual(changedResources, [
			target.resource.toString(),
			target.resource.toString(),
		]);
	});

	test("plot cache changes update only affected thumbnail previews", async () => {
		const targetA = createPreviewTarget("file-a");
		const targetB = createPreviewTarget("file-b");
		const cacheEmitter = store.add(new Emitter<ThumbnailPlotCacheEventForTest>());
		const signaturesByFileId: Record<string, string> = {
			"file-a": "plot:file-a",
			"file-b": "plot:file-b",
		};
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: (input: PlotPreviewInput) => {
					const fileId = getPreviewInputId(input);
					return {
						fileId,
						signature: signaturesByFileId[fileId] ?? `plot:${fileId}`,
					};
				},
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: cacheEmitter.event,
				onDidChangePlotState: Event.None,
			} as unknown as IPlotService,
		));
		const changedResources: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedResources.push(event.resource.toString());
		}));

		service.request(targetA, "hover");
		service.request(targetB, "hover");
		await timeout();
		changedResources.length = 0;

		assert.equal(service.get(targetA).kind, "ready");
		assert.equal(service.get(targetB).kind, "ready");

		signaturesByFileId["file-b"] = "plot:file-b:next";
		cacheEmitter.fire({ plotType: "iv", resource: targetB.resource });

		assert.equal(service.get(targetA).kind, "ready");
		assert.equal(service.get(targetB).kind, "ready");
		assert.deepEqual(changedResources, [targetB.resource.toString()]);
	});

	test("bitmap drawing skips detached canvases instead of using fallback dimensions", () => {
		const canvas = {
			height: 150,
			isConnected: false,
			width: 300,
		} as unknown as HTMLCanvasElement;

		drawThumbnailBitmap({
			canvas,
				options: {
					model: {
						pointsCount: 0,
						seriesList: [],
					signature: "detached",
					xDomain: [0, 1],
					xUnitLabel: "V",
					yDomain: [0, 1],
					yUnitLabel: "A",
				},
				plotType: "iv",
			},
		});

		assert.equal(canvas.width, 300);
		assert.equal(canvas.height, 150);
	});
});

const timeout = async (): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, 0));

type PlotPreviewInput = Parameters<IPlotService["getCachedCalculatedData"]>[0];

type ThumbnailPlotCacheEventForTest = {
	readonly plotType: "iv";
	readonly resource: URI;
	readonly sheetId?: string | null;
};

const createPreviewTarget = (fileId: string): {
	readonly resource: URI;
} => ({
	resource: URI.file(`/data/${fileId}.csv`),
});

const getPreviewInputId = (input: PlotPreviewInput): string => {
	const fileName = input.resource?.path.split("/").at(-1) ?? "";
	return fileName.replace(/\.csv$/i, "");
};

const createCalculatedDataForPreview = (input: PlotPreviewInput) => {
	const fileId = getPreviewInputId(input);
	return {
		activeFile: null,
		fileId,
		kind: "iv" as const,
		pointsCount: 1,
		seriesList: [],
		signature: `calculated:${fileId}`,
		source: { fileId, inputKind: "record" as const },
		xDomain: [0, 1] as [number, number],
		xUnitLabel: "V",
		yDomain: [0, 1] as [number, number],
		yUnitLabel: "A",
	};
};

const createDisplayModelForPreview = (input: PlotPreviewInput) => {
	const fileId = getPreviewInputId(input);
	return {
		chart: {
			defaultXAxisTitle: "x",
			defaultYAxisTitle: "y",
			model: {
				axisLabels: null,
				pointsCount: 1,
				seriesList: [{
					data: [{ x: 0, y: 0 }],
					id: "series-a",
					name: "A",
				}],
				xDomain: [0, 1] as [number, number],
				xUnitLabel: "V",
				yDomain: [0, 1] as [number, number],
				yUnitLabel: "A",
			},
			plotXFactor: 1,
			plotYFactor: 1,
			xAxisTitle: "x",
			xAxisTitleContext: {
				axis: "x" as const,
				fileId,
				pane: "chart" as const,
				plotType: "iv" as const,
			},
			yAxisTitle: "y",
			yAxisTitleContext: {
				axis: "y" as const,
				fileId,
				pane: "chart" as const,
				plotType: "iv" as const,
			},
			yScaleMode: "linear" as const,
		},
		fileId,
		inspector: null,
		plotType: "iv" as const,
		unitControl: null,
	};
};
