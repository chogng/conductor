/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createTemplateApplyInput } from "src/cs/workbench/services/template/browser/templateApplyInput";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type { TableModel } from "src/cs/workbench/services/table/common/table";
import type { TemplateState } from "src/cs/workbench/services/template/common/template";

suite("workbench/services/template/test/browser/templateApplyInput", () => {
	test("creates controller input from read model, table model, and template state", () => {
		const previewFile = { fileId: "file-a" };
		const input = createTemplateApplyInput({
			readModel: {
				processedFileIds: ["file-b"],
				rawFiles: [{ fileId: "file-a", fileName: "raw.csv" }],
			} as SessionReadModel,
			tableModel: {
				getRow: rowIndex => `row-${rowIndex}`,
				getState: () => ({ file: previewFile }),
				hasSourceFile: fileId => fileId === "file-a",
			} as Pick<TableModel, "getRow" | "getState" | "hasSourceFile">,
			templateState: {
				formState: {},
				mode: "select",
				selectedTemplateId: "template-a",
				selectionsByFileId: {
					"file-a": { kind: "auto" },
				},
			} as TemplateState,
		});

		assert.equal(input.getTableRow(2), "row-2");
		assert.equal(input.hasSourceFile("file-a"), true);
		assert.equal(input.previewFile, previewFile);
		assert.deepEqual(input.processedFileIds, ["file-b"]);
		assert.deepEqual(input.rawFiles, [{ fileId: "file-a", fileName: "raw.csv" }]);
		assert.deepEqual(input.fileTemplateSelectionsByFileId, {
			"file-a": { kind: "auto" },
		});
		assert.deepEqual(input.templateSelection, {
			kind: "template",
			templateId: "template-a",
		});
		assert.equal("activeFileId" in input, false);
	});
});
