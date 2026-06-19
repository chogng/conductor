/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createTemplateApplyInput } from "src/cs/workbench/services/template/browser/templateApplyInput";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type { TemplateState } from "src/cs/workbench/services/template/common/template";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/test/browser/templateApplyInput", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("creates controller input from read model and template state", () => {
		const input = createTemplateApplyInput({
			activeFileId: " file-a ",
			readModel: {
				processedFileIds: ["file-b"],
				rawFiles: [{ fileId: "file-a", fileName: "raw.csv" }],
			} as SessionReadModel,
			templateRecords: [{ id: "template-a", name: "Template A" }],
			templateState: {
				formState: {},
				mode: "management",
				selectedTemplateId: "template-a",
				selectionsByFileId: {
				"file-a": { kind: "auto" },
				},
			} as unknown as TemplateState,
		});

		assert.deepEqual(input.processedFileIds, ["file-b"]);
		assert.deepEqual(input.rawFiles, [{ fileId: "file-a", fileName: "raw.csv" }]);
		assert.deepEqual(input.fileTemplateSelectionsByFileId, {
			"file-a": { kind: "auto" },
		});
		assert.deepEqual(input.templateSelection, {
			kind: "template",
			templateId: "template-a",
		});
		assert.deepEqual(input.templateRecords, [{ id: "template-a", name: "Template A" }]);
		assert.equal(input.activeFileId, "file-a");
	});
});
