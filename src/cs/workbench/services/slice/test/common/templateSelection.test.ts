/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createTemplateSelection,
	getTemplateSelectionId,
	getTemplateSelectionTemplateId,
	isAutoTemplateId,
	removeTemplateSelectionsForFiles,
	removeTemplateSelectionsForTemplate,
	resolveTemplateSelectionForFile,
} from "src/cs/workbench/services/slice/common/templateSelection";

suite("workbench/services/slice/test/common/templateSelection", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("creates auto and saved template selections", () => {
		assert.deepEqual(createTemplateSelection(null), { kind: "auto" });
		assert.deepEqual(createTemplateSelection("auto"), { kind: "auto" });
		assert.deepEqual(createTemplateSelection(" template-a "), {
			kind: "saved",
			templateId: "template-a",
		});
	});

	test("uses a non-persisted auto selection id for UI comparisons", () => {
		assert.equal(getTemplateSelectionId({ kind: "auto" }), "auto");
	});

	test("auto template id only accepts the current recommended-template option", () => {
		assert.equal(isAutoTemplateId("auto"), true);
		assert.equal(isAutoTemplateId("user-template"), false);
		assert.equal(isAutoTemplateId(null), false);
	});

	test("resolves file selection before current selection", () => {
		const current = createTemplateSelection("template-current");

		assert.deepEqual(
			resolveTemplateSelectionForFile(
				"file-a",
				{ "file-a": createTemplateSelection("template-file") },
				current,
			),
			{ kind: "saved", templateId: "template-file" },
		);
		assert.equal(resolveTemplateSelectionForFile("file-b", {}, current), current);
	});

	test("removes selections for deleted files", () => {
		assert.deepEqual(
			removeTemplateSelectionsForFiles(
				{
					"file-a": createTemplateSelection("template-a"),
					"file-b": createTemplateSelection("template-b"),
				},
				["file-a"],
			),
			{
				"file-b": createTemplateSelection("template-b"),
			},
		);
	});

	test("removes selections for deleted templates", () => {
		assert.deepEqual(
			removeTemplateSelectionsForTemplate(
				{
					"file-a": createTemplateSelection("template-a"),
					"file-b": createTemplateSelection("template-b"),
					"file-c": { kind: "auto" },
				},
				"template-a",
			),
			{
				"file-b": createTemplateSelection("template-b"),
				"file-c": { kind: "auto" },
			},
		);
	});
});
