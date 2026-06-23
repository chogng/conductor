/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  isAutoTemplateApplyConfig,
  isAutoTemplateId,
} from "src/cs/workbench/services/template/common/autoTemplate";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/autoTemplate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("auto template id is only the special auto extraction option", () => {
    assert.equal(isAutoTemplateId("auto"), true);
    assert.equal(isAutoTemplateId("0"), true);
    assert.equal(isAutoTemplateId(0), true);
    assert.equal(isAutoTemplateId("__auto__"), true);
    assert.equal(isAutoTemplateId("user-template"), false);
    assert.equal(isAutoTemplateId(null), false);
  });

  test("auto template config is marked by auto extraction mode", () => {
    assert.equal(isAutoTemplateApplyConfig({ autoExtractionMode: true }), true);
    assert.equal(isAutoTemplateApplyConfig({ autoExtractionMode: false }), false);
    assert.equal(isAutoTemplateApplyConfig({}), false);
  });
});
