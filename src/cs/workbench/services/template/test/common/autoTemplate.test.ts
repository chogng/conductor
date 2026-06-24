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
  test("auto template id is only the legacy recommended-template option", () => {
    assert.equal(isAutoTemplateId("auto"), true);
    assert.equal(isAutoTemplateId("0"), true);
    assert.equal(isAutoTemplateId(0), true);
    assert.equal(isAutoTemplateId("__auto__"), true);
    assert.equal(isAutoTemplateId("user-template"), false);
    assert.equal(isAutoTemplateId(null), false);
  });
});
