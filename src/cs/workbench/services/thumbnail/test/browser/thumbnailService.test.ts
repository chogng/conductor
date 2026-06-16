/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
	BrowserThumbnailPreviewService,
	BrowserThumbnailService,
} from "src/cs/workbench/services/thumbnail/browser/thumbnailService";

suite("workbench/services/thumbnail/test/browser/thumbnailService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns thumbnail cache lifecycle outside session", () => {
		const service = store.add(new BrowserThumbnailService());

		service.clear();

		assert.ok(true);
	});

	test("preview service caches plot previews and invalidates by file id", () => {
		let calculatedCalls = 0;
		const service = store.add(new BrowserThumbnailPreviewService(
			{
				getCalculatedData: ({ fileId }: { readonly fileId: string }) => {
					calculatedCalls += 1;
					return {
						fileId,
						signature: `plot:${fileId}`,
					};
				},
				getState: () => ({ activePlotType: "iv" }),
				onDidChangePlotState: Event.None,
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
		assert.equal(service.request("file-a", "hover").kind, "ready");
		assert.equal(calculatedCalls, 1);
		service.invalidate(["file-a"]);
		assert.equal(service.get("file-a").kind, "idle");
		assert.deepEqual(changedFileIds, ["file-a", "file-a"]);
	});
});
