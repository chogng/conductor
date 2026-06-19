/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
	BrowserThumbnailPreviewService,
	BrowserThumbnailService,
} from "src/cs/workbench/services/thumbnail/browser/thumbnailService";
import { drawThumbnailBitmap } from "src/cs/workbench/services/thumbnail/browser/thumbnailBitmap";

suite("workbench/services/thumbnail/test/browser/thumbnailService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns thumbnail cache lifecycle outside session", () => {
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

	test("hover previews synchronously use PlotService when cache is cold and invalidate by file id", async () => {
		let cachedCalls = 0;
		let calculatedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					cachedCalls += 1;
					return null;
				},
				getCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					calculatedCalls += 1;
					return {
						fileId,
						signature: `plot:${fileId}`,
					};
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			{
				getSnapshot: () => ({
					fileOrder: ["file-a"],
					filesById: {
						"file-a": {
							curvesByKey: {},
							id: "file-a",
							raw: {},
						},
					},
					schemaVersion: 1,
					sessionVersion: 1,
				}),
				onDidChangeSession: Event.None,
			} as unknown as ISessionService,
		));
		const changedFileIds: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedFileIds.push(event.fileId);
		}));

		assert.equal(service.get("file-a").kind, "idle");
		assert.equal(service.request("file-a", "hover").kind, "ready");
		assert.equal(cachedCalls, 1);
		assert.equal(calculatedCalls, 1);
		await timeout();
		assert.equal(service.get("file-a").kind, "ready");
		assert.equal(service.request("file-a", "hover").kind, "ready");
		assert.equal(cachedCalls, 1);
		assert.equal(calculatedCalls, 1);
		service.invalidate(["file-a"]);
		assert.equal(service.get("file-a").kind, "ready");
		assert.deepEqual(changedFileIds, ["file-a"]);
	});

	test("hover previews use cached Plot display models as fast thumbnails", () => {
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => ({
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
				}),
				getCachedPlotDisplayModel: ({ fileId }: { readonly fileId: string }) => ({
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
				}),
				getCalculatedData: () => {
					throw new Error("fast thumbnails should not synchronously calculate when display cache is warm");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: () => undefined,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a"]) as unknown as ISessionService,
		));

		const state = service.request("file-a", "hover");

		assert.equal(state.kind, "fastReady");
		assert.equal(state.kind === "fastReady" ? state.signature : "", "calculated:file-a");
		assert.equal(state.kind === "fastReady" ? state.model.seriesList.length : 0, 1);
	});

	test("fast thumbnails stay stable when full calculated data has the same signature", () => {
		const displayModelEmitter = new Emitter<{ readonly fileId: string; readonly plotType: string }>();
		let displayCacheWarm = true;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => ({
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
				}),
				getCachedPlotDisplayModel: ({ fileId }: { readonly fileId: string }) => displayCacheWarm
					? {
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
					}
					: null,
				getCalculatedData: () => {
					throw new Error("fast thumbnail stability should not synchronously calculate");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotDisplayModelCache: displayModelEmitter.event,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: () => undefined,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a"]) as unknown as ISessionService,
		));
		const changedFileIds: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedFileIds.push(event.fileId);
		}));

		assert.equal(service.request("file-a", "hover").kind, "fastReady");
		changedFileIds.length = 0;
		displayCacheWarm = false;
		displayModelEmitter.fire({ fileId: "file-a", plotType: "iv" });

		assert.equal(service.get("file-a").kind, "fastReady");
		assert.deepEqual(changedFileIds, []);
	});

	test("ready previews upgrade to fast thumbnails when display cache becomes warm", () => {
		const displayModelEmitter = new Emitter<{ readonly fileId: string; readonly plotType: string }>();
		let displayCacheWarm = false;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => ({
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
				}),
				getCachedPlotDisplayModel: ({ fileId }: { readonly fileId: string }) => displayCacheWarm
					? {
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
					}
					: null,
				getCalculatedData: () => {
					throw new Error("ready thumbnail upgrade should not synchronously calculate");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotDisplayModelCache: displayModelEmitter.event,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: () => undefined,
				prefetchPlotDisplayModel: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a"]) as unknown as ISessionService,
		));
		const changedFileIds: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedFileIds.push(event.fileId);
		}));

		assert.equal(service.request("file-a", "hover").kind, "ready");
		changedFileIds.length = 0;
		displayCacheWarm = true;
		displayModelEmitter.fire({ fileId: "file-a", plotType: "iv" });

		assert.equal(service.get("file-a").kind, "fastReady");
		assert.deepEqual(changedFileIds, ["file-a"]);
	});

	test("hover request retries a cached loading preview", () => {
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					cachedCalls += 1;
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
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a"]) as unknown as ISessionService,
		));
		const changedFileIds: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedFileIds.push(event.fileId);
		}));

		assert.equal(service.request("file-a", "nearby").kind, "loading");
		modelReady = true;

		assert.equal(service.request("file-a", "hover").kind, "ready");
		assert.equal(cachedCalls, 2);
		assert.deepEqual(changedFileIds, ["file-a", "file-a"]);
	});

	test("visible request queues a cached loading preview without synchronous retry", async () => {
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					cachedCalls += 1;
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
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a"]) as unknown as ISessionService,
		));

		assert.equal(service.request("file-a", "nearby").kind, "loading");
		modelReady = true;
		assert.equal(service.request("file-a", "visible").kind, "loading");
		assert.equal(cachedCalls, 1);

		await timeout();

		assert.equal(cachedCalls, 2);
		assert.equal(service.get("file-a").kind, "ready");
	});

	test("preview requests promote matching plot calculated data priority when hover cannot synchronously resolve", async () => {
		const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
		const calculatedFileIds: string[] = [];
		let modelReady = false;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					calculatedFileIds.push(fileId);
					return modelReady
						? {
							fileId,
							signature: `plot:${fileId}`,
						}
						: null;
				},
				getCalculatedData: () => null,
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: (fileIds: readonly string[], priority: string) => {
					plotPrefetches.push({ fileIds, priority });
				},
			} as unknown as IPlotService,
			createSessionService(["hover-a", "visible-a"]) as unknown as ISessionService,
		));

		service.request("hover-a", "hover");
		service.prefetch(["visible-a"], "visible");

		assert.deepEqual(plotPrefetches, [
			{ fileIds: ["hover-a"], priority: "hover" },
			{ fileIds: ["visible-a"], priority: "visible" },
		]);
		assert.deepEqual(calculatedFileIds, ["hover-a"]);

		modelReady = true;
		await timeout();

		assert.deepEqual(calculatedFileIds, ["hover-a", "hover-a", "visible-a"]);
	});

	test("preview prefetch runs through a deferred budgeted queue", async () => {
		const calculatedFileIds: string[] = [];
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
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
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a", "file-b"]) as unknown as ISessionService,
		));

		service.prefetch(["file-a", "file-b"], "nearby");

		assert.deepEqual(calculatedFileIds, []);
		await timeout();

		assert.deepEqual(calculatedFileIds, ["file-a", "file-b"]);
		assert.equal(service.get("file-a").kind, "ready");
		assert.equal(service.get("file-b").kind, "ready");
	});

	test("preview prefetch processes visible then recent files before nearby backlog", async () => {
		const calculatedFileIds: string[] = [];
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
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
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			createSessionService([
				"nearby-a",
				"nearby-b",
				"nearby-c",
				"nearby-d",
				"recent-a",
				"visible-a",
			]) as unknown as ISessionService,
		));

		service.prefetch(["nearby-a", "nearby-b", "nearby-c", "nearby-d"], "nearby");
		service.prefetch(["recent-a"], "recent");
		service.prefetch(["visible-a"], "visible");

		await timeout();

		assert.equal(calculatedFileIds[0], "visible-a");
		assert.equal(calculatedFileIds[1], "recent-a");
	});

	test("preview prefetch refreshes when plot cache becomes warm", async () => {
		const cacheEmitter = store.add(new Emitter<{ readonly fileId: string; readonly plotType: "iv" }>());
		let modelReady = false;
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					cachedCalls += 1;
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
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			createSessionService(["file-a"]) as unknown as ISessionService,
		));

		service.prefetch(["file-a"], "visible");

		await timeout();

		assert.equal(cachedCalls, 1);
		assert.equal(service.get("file-a").kind, "loading");

		modelReady = true;
		cacheEmitter.fire({ fileId: "file-a", plotType: "iv" });

		assert.equal(cachedCalls, 2);
		assert.equal(service.get("file-a").kind, "ready");
	});

	test("targeted session changes retry loading hover previews", () => {
		const sessionEmitter = store.add(new Emitter<{
			readonly fileIds?: readonly string[];
			readonly reason: "templateRunChanged";
			readonly sessionVersion: number;
		}>());
		let modelReady = false;
		let calculatedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: () => null,
				getCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					calculatedCalls += 1;
					return modelReady
						? {
							fileId,
							signature: `plot:${fileId}`,
						}
						: null;
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			{
				...createSessionService(["file-a"]),
				onDidChangeSession: sessionEmitter.event,
			} as unknown as ISessionService,
		));
		const changedFileIds: string[] = [];
		store.add(service.onDidChangePreview(event => {
			changedFileIds.push(event.fileId);
		}));

		assert.equal(service.request("file-a", "hover").kind, "loading");
		assert.equal(calculatedCalls, 1);

		modelReady = true;
		sessionEmitter.fire({
			fileIds: ["file-a"],
			reason: "templateRunChanged",
			sessionVersion: 2,
		});

		assert.equal(service.get("file-a").kind, "ready");
		assert.equal(calculatedCalls, 2);
		assert.deepEqual(changedFileIds, ["file-a", "file-a"]);
	});

	test("session changes invalidate only affected thumbnail previews", async () => {
		const sessionEmitter = store.add(new Emitter<{
			readonly fileIds?: readonly string[];
			readonly reason: "templateRunChanged";
			readonly sessionVersion: number;
		}>());
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => ({
					fileId,
					signature: `plot:${fileId}`,
				}),
				getCalculatedData: () => {
					throw new Error("thumbnail previews must not synchronously calculate plot data");
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangeCalculatedDataCache: Event.None,
				onDidChangePlotState: Event.None,
				prefetchCalculatedData: () => undefined,
			} as unknown as IPlotService,
			{
				getSnapshot: () => ({
					fileOrder: ["file-a", "file-b"],
					filesById: {
						"file-a": {
							curvesByKey: {},
							id: "file-a",
							raw: {},
						},
						"file-b": {
							curvesByKey: {},
							id: "file-b",
							raw: {},
						},
					},
					schemaVersion: 1,
					sessionVersion: 1,
				}),
				onDidChangeSession: sessionEmitter.event,
			} as unknown as ISessionService,
		));

		service.request("file-a", "hover");
		service.request("file-b", "hover");
		await timeout();

		assert.equal(service.get("file-a").kind, "ready");
		assert.equal(service.get("file-b").kind, "ready");

		sessionEmitter.fire({
			fileIds: ["file-b"],
			reason: "templateRunChanged",
			sessionVersion: 2,
		});

		assert.equal(service.get("file-a").kind, "ready");
		assert.equal(service.get("file-b").kind, "ready");
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

const createSessionService = (fileIds: readonly string[]) => ({
	getSnapshot: () => ({
		fileOrder: [...fileIds],
		filesById: Object.fromEntries(fileIds.map(fileId => [fileId, {
			curvesByKey: {},
			id: fileId,
			raw: {},
		}])),
		schemaVersion: 1,
		sessionVersion: 1,
	}),
	onDidChangeSession: Event.None,
});

const timeout = async (): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, 0));
