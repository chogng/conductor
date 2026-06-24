/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createCurrentTemplateSelectionDisplay } from "src/cs/workbench/contrib/files/browser/templateSelectionDisplay";

suite("workbench/contrib/files/test/browser/templateSelectionDisplay", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
