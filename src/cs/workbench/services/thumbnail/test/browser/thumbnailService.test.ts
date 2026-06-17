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

	test("preview service caches plot previews and invalidates by file id", async () => {
		let cachedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCachedCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					cachedCalls += 1;
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
		assert.equal(service.request("file-a", "hover").kind, "loading");
		assert.equal(cachedCalls, 0);
		await timeout();
		assert.equal(service.get("file-a").kind, "ready");
		assert.equal(service.request("file-a", "hover").kind, "ready");
		assert.equal(cachedCalls, 1);
		service.invalidate(["file-a"]);
		assert.equal(service.get("file-a").kind, "idle");
		assert.deepEqual(changedFileIds, ["file-a", "file-a", "file-a"]);
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

	test("preview requests promote matching plot calculated data priority", async () => {
		const plotPrefetches: Array<{ fileIds: readonly string[]; priority: string }> = [];
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
		assert.deepEqual(calculatedFileIds, []);

		await timeout();

		assert.deepEqual(calculatedFileIds, ["hover-a", "visible-a"]);
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

	test("preview prefetch processes visible files before nearby backlog", async () => {
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
				"visible-a",
			]) as unknown as ISessionService,
		));

		service.prefetch(["nearby-a", "nearby-b", "nearby-c", "nearby-d"], "nearby");
		service.prefetch(["visible-a"], "visible");

		await timeout();

		assert.equal(calculatedFileIds[0], "visible-a");
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
