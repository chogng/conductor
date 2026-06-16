/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	DEFAULT_WORKBENCH_BACKGROUND_COLOR,
	normalizeWorkbenchAppearance,
	normalizeWorkbenchBackgroundColor,
} from "src/cs/workbench/services/themes/common/themeService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/themes/common/themeService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("normalizes workbench appearance settings", () => {
		assert.deepStrictEqual(normalizeWorkbenchAppearance({
			backgroundColor: " #ABCDEF ",
			transparentChrome: true,
		}), {
			backgroundColor: "#abcdef",
			transparentChrome: true,
		});
	});

	test("falls back invalid background colors to the default", () => {
		assert.deepStrictEqual({
			shortHex: normalizeWorkbenchBackgroundColor("#fff"),
			invalidText: normalizeWorkbenchBackgroundColor("transparent"),
			missing: normalizeWorkbenchBackgroundColor(undefined),
		}, {
			shortHex: DEFAULT_WORKBENCH_BACKGROUND_COLOR,
			invalidText: DEFAULT_WORKBENCH_BACKGROUND_COLOR,
			missing: DEFAULT_WORKBENCH_BACKGROUND_COLOR,
		});
	});
});
