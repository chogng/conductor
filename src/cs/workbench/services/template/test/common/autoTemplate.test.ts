/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  isAutoTemplateId,
} from "src/cs/workbench/services/template/common/autoTemplate";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/autoTemplate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("auto template id only accepts the current recommended-template option", () => {
    assert.equal(isAutoTemplateId("auto"), true);
    assert.equal(isAutoTemplateId("user-template"), false);
    assert.equal(isAutoTemplateId(null), false);
  });
});
