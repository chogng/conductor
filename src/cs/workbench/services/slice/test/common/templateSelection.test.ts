/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	areTemplateResourceSelectionsEqual,
	createTemplateSelection,
	getTemplateSelectionId,
	isAutoTemplateId,
	removeTemplateSelectionsForResources,
	removeTemplateSelectionsForTemplate,
	resolveTemplateSelectionForResource,
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

	test("resolves resource selection before current selection", () => {
		const current = createTemplateSelection("template-current");
		const resource = URI.file("/workspace/file-a.csv");
		const resourceSelection = { resource, sheetId: "sheet-a" };

		assert.deepEqual(
			resolveTemplateSelectionForResource(
				resourceSelection,
				[{ ...resourceSelection, selection: createTemplateSelection("template-file") }],
				current,
			),
			{ kind: "saved", templateId: "template-file" },
		);
		assert.equal(
			resolveTemplateSelectionForResource({ resource: URI.file("/workspace/file-b.csv") }, [], current),
			current,
		);
	});

	test("removes selections for deleted resources", () => {
		const resourceA = { resource: URI.file("/workspace/file-a.csv") };
		const resourceB = { resource: URI.file("/workspace/file-b.csv"), sheetId: "sheet-b" };
		assert.deepEqual(
			removeTemplateSelectionsForResources(
				[
					{ ...resourceA, selection: createTemplateSelection("template-a") },
					{ ...resourceB, selection: createTemplateSelection("template-b") },
				],
				[resourceA],
			),
			[
				{ ...resourceB, selection: createTemplateSelection("template-b") },
			],
		);
	});

	test("removes selections for deleted templates", () => {
		const resourceA = { resource: URI.file("/workspace/file-a.csv") };
		const resourceB = { resource: URI.file("/workspace/file-b.csv") };
		const resourceC = { resource: URI.file("/workspace/file-c.csv") };
		assert.deepEqual(
			removeTemplateSelectionsForTemplate(
				[
					{ ...resourceA, selection: createTemplateSelection("template-a") },
					{ ...resourceB, selection: createTemplateSelection("template-b") },
					{ ...resourceC, selection: { kind: "auto" } },
				],
				"template-a",
			),
			[
				{ ...resourceB, selection: createTemplateSelection("template-b") },
				{ ...resourceC, selection: { kind: "auto" } },
			],
		);
	});

	test("compares resource selections without depending on insertion order", () => {
		const resourceA = { resource: URI.file("/workspace/file-a.csv") };
		const resourceB = { resource: URI.file("/workspace/file-b.csv") };

		assert.equal(areTemplateResourceSelectionsEqual(
			[
				{ ...resourceA, selection: createTemplateSelection("template-a") },
				{ ...resourceB, selection: { kind: "auto" } },
			],
			[
				{ ...resourceB, selection: { kind: "auto" } },
				{ ...resourceA, selection: createTemplateSelection("template-a") },
			],
		), true);
	});
});
