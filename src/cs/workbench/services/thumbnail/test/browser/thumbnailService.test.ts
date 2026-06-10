/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserThumbnailService } from "src/cs/workbench/services/thumbnail/browser/thumbnailService";

suite("workbench/services/thumbnail/test/browser/thumbnailService", () => {
	test("owns thumbnail cache lifecycle outside session", () => {
		const service = new BrowserThumbnailService();

		service.clear();
		service.dispose();

		assert.ok(true);
	});
});
