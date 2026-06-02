import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeExtractionErrorDetails,
  parseOlderExtractionError,
} from "../common/extractionErrors.ts";
import { stableStringify } from "../common/templateStableKey.ts";

test("structured extraction error payload wins over legacy message parsing", () => {
  const details = normalizeExtractionErrorDetails({
    fileName: "structured.csv",
    message:
      "legacy.csv: X range has 12 points, which is not divisible by points=5.",
    messageKey: "da_structuredError",
    messageParams: { value: 42 },
  });

  assert.deepEqual(details, {
    fileName: "structured.csv",
    message:
      "legacy.csv: X range has 12 points, which is not divisible by points=5.",
    messageKey: "da_structuredError",
    messageParams: { value: 42 },
  });
});

test("legacy extraction errors parse older worker messages", () => {
  assert.deepEqual(
    parseOlderExtractionError(
      "demo.csv: X range has 12 points, which is not divisible by points=5 (from B2).",
    ),
    {
      fileName: "demo.csv",
      messageKey: "da_extractXNotDivisibleByPointsFromCell",
      messageParams: {
        cell: "B2",
        points: 5,
        total: 12,
      },
    },
  );
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

  const cyclic = { b: 2, a: 1 };
  cyclic.self = cyclic;

  assert.equal(stableStringify(cyclic), '{"a":1,"b":2,"self":null}');
});
