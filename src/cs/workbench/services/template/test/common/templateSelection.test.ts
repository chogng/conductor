/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	createCurrentTemplateSelectionDisplay,
	createTemplateSelection,
	getTemplateSelectionId,
	getTemplateSelectionTemplateId,
	removeTemplateSelectionsForFiles,
	removeTemplateSelectionsForTemplate,
	resolveTemplateSelectionForFile,
} from "src/cs/workbench/services/template/common/templateSelection";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/test/common/templateSelection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("creates auto and saved template selections", () => {
		assert.deepEqual(createTemplateSelection(null), { kind: "auto" });
		assert.deepEqual(createTemplateSelection("auto"), { kind: "auto" });
		assert.deepEqual(createTemplateSelection("0"), { kind: "auto" });
		assert.deepEqual(createTemplateSelection("__auto__"), { kind: "auto" });
		assert.deepEqual(createTemplateSelection(" template-a "), {
			kind: "saved",
			templateId: "template-a",
		});
	});

	test("uses a non-persisted auto selection id for UI comparisons", () => {
		assert.equal(getTemplateSelectionId({ kind: "auto" }), "auto");
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

	test("reads legacy template selections as saved template ids", () => {
		assert.equal(
			getTemplateSelectionTemplateId({ kind: "template", templateId: " template-a " }),
			"template-a",
		);
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

	test("creates current template display from selected id and form name", () => {
		assert.deepEqual(createCurrentTemplateSelectionDisplay({
			selectedTemplateId: null,
		}), {
			label: "template.recommendedTemplate",
			selection: { kind: "auto" },
		});
		assert.deepEqual(createCurrentTemplateSelectionDisplay({
			formName: " My Template ",
			selectedTemplateId: "template-a",
		}), {
			label: "My Template",
			selection: { kind: "saved", templateId: "template-a" },
		});
		assert.deepEqual(createCurrentTemplateSelectionDisplay({
			selectedTemplateId: "template-a",
		}), {
			label: "template-a",
			selection: { kind: "saved", templateId: "template-a" },
		});
	});
});
