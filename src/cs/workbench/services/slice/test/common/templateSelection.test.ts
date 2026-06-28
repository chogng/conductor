/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	areTemplateTargetSelectionsEqual,
	createTemplateSelection,
	getTemplateSelectionId,
	isAutoTemplateId,
	removeTemplateSelectionsForTargets,
	removeTemplateSelectionsForTemplate,
	resolveTemplateSelectionForTarget,
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

	test("resolves target selection before current selection", () => {
		const current = createTemplateSelection("template-current");
		const resource = URI.file("/workspace/file-a.csv");
		const target = { resource, sheetId: "sheet-a" };

		assert.deepEqual(
			resolveTemplateSelectionForTarget(
				target,
				[{ target, selection: createTemplateSelection("template-file") }],
				current,
			),
			{ kind: "saved", templateId: "template-file" },
		);
		assert.equal(
			resolveTemplateSelectionForTarget({ resource: URI.file("/workspace/file-b.csv") }, [], current),
			current,
		);
	});

	test("removes selections for deleted targets", () => {
		const targetA = { resource: URI.file("/workspace/file-a.csv") };
		const targetB = { resource: URI.file("/workspace/file-b.csv"), sheetId: "sheet-b" };
		assert.deepEqual(
			removeTemplateSelectionsForTargets(
				[
					{ target: targetA, selection: createTemplateSelection("template-a") },
					{ target: targetB, selection: createTemplateSelection("template-b") },
				],
				[targetA],
			),
			[
				{ target: targetB, selection: createTemplateSelection("template-b") },
			],
		);
	});

	test("removes selections for deleted templates", () => {
		const targetA = { resource: URI.file("/workspace/file-a.csv") };
		const targetB = { resource: URI.file("/workspace/file-b.csv") };
		const targetC = { resource: URI.file("/workspace/file-c.csv") };
		assert.deepEqual(
			removeTemplateSelectionsForTemplate(
				[
					{ target: targetA, selection: createTemplateSelection("template-a") },
					{ target: targetB, selection: createTemplateSelection("template-b") },
					{ target: targetC, selection: { kind: "auto" } },
				],
				"template-a",
			),
			[
				{ target: targetB, selection: createTemplateSelection("template-b") },
				{ target: targetC, selection: { kind: "auto" } },
			],
		);
	});

	test("compares target selections without depending on insertion order", () => {
		const targetA = { resource: URI.file("/workspace/file-a.csv") };
		const targetB = { resource: URI.file("/workspace/file-b.csv") };

		assert.equal(areTemplateTargetSelectionsEqual(
			[
				{ target: targetA, selection: createTemplateSelection("template-a") },
				{ target: targetB, selection: { kind: "auto" } },
			],
			[
				{ target: targetB, selection: { kind: "auto" } },
				{ target: targetA, selection: createTemplateSelection("template-a") },
			],
		), true);
	});
});
