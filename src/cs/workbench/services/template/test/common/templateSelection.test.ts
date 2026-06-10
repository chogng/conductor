/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	createCurrentTemplateSelectionDisplay,
	createTemplateSelection,
	removeTemplateSelectionsForFiles,
	resolveTemplateSelectionForFile,
} from "src/cs/workbench/services/template/common/templateSelection";

suite("workbench/services/template/test/common/templateSelection", () => {
	test("creates auto and saved template selections", () => {
		assert.deepEqual(createTemplateSelection(null), { kind: "auto" });
		assert.deepEqual(createTemplateSelection("__auto__"), { kind: "auto" });
		assert.deepEqual(createTemplateSelection(" template-a "), {
			kind: "template",
			templateId: "template-a",
		});
	});

	test("resolves file selection before current selection", () => {
		const current = createTemplateSelection("template-current");

		assert.deepEqual(
			resolveTemplateSelectionForFile(
				"file-a",
				{ "file-a": createTemplateSelection("template-file") },
				current,
			),
			{ kind: "template", templateId: "template-file" },
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

	test("creates current template display from selected id and form name", () => {
		assert.deepEqual(createCurrentTemplateSelectionDisplay({
			selectedTemplateId: null,
		}), {
			label: "template_auto_extraction",
			selection: { kind: "auto" },
		});
		assert.deepEqual(createCurrentTemplateSelectionDisplay({
			formName: " My Template ",
			selectedTemplateId: "template-a",
		}), {
			label: "My Template",
			selection: { kind: "template", templateId: "template-a" },
		});
		assert.deepEqual(createCurrentTemplateSelectionDisplay({
			selectedTemplateId: "template-a",
		}), {
			label: "template-a",
			selection: { kind: "template", templateId: "template-a" },
		});
	});
});
