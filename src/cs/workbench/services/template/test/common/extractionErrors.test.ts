/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { normalizeExtractionErrorDetails } from "src/cs/workbench/services/template/common/extractionErrors";
import { stableStringify } from "src/cs/workbench/services/template/common/templateStableKey";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/extractionErrors", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("normalizes structured extraction error payload", () => {
    const details = normalizeExtractionErrorDetails({
      fileName: "structured.csv",
      message: "X range is not divisible by points.",
      messageKey: "structuredError",
      messageParams: { value: 42 },
    });

    assert.deepEqual(details, {
      fileName: "structured.csv",
      message: "X range is not divisible by points.",
      messageKey: "structuredError",
      messageParams: { value: 42 },
    });
  });

  test("unknown extraction errors keep the raw message", () => {
    assert.deepEqual(
      normalizeExtractionErrorDetails({
        message: "Something unexpected happened.",
      }),
      {
        fileName: null,
        message: "Something unexpected happened.",
        messageKey: null,
        messageParams: null,
      },
    );
  });

  test("stableStringify sorts keys and handles cycles", () => {
    assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));

    const cyclic: { a: number; b: number; self?: unknown } = { b: 2, a: 1 };
    cyclic.self = cyclic;

    assert.equal(stableStringify(cyclic), '{"a":1,"b":2,"self":null}');
  });
});
