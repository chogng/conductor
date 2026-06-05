import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILE_NAME_FIELD_SEPARATORS,
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
} from "../../common/fileNameMatching.ts";

test("normalizeFileNameFieldSeparators falls back to defaults", () => {
  assert.equal(
    normalizeFileNameFieldSeparators(""),
    DEFAULT_FILE_NAME_FIELD_SEPARATORS,
  );
});

test("matchFileNameAgainstPatternTokens uses normalized filename fields", () => {
  assert.equal(
    matchFileNameAgainstPatternTokens("Trans_xxxxx.csv", ["trans"], {
      separators: "_",
    }),
    true,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens("TransSweep.csv", ["sweep"], {
      separators: "_- ",
    }),
    true,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens("TransSweep.csv", ["ans"], {
      separators: "_- ",
    }),
    false,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens("Trans_xxxxx.csv", ["output"], {
      separators: "_",
    }),
    false,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_].csv",
      ["Lc200nm"],
      {
        separators: "_- .()[]{}",
      },
    ),
    true,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_].csv",
      ["1-1-0.1UM"],
      {
        separators: "_- .()[]{}",
      },
    ),
    true,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens(
      "Output [TLM #1_Lc200nm(1) _1-1-0.3UM, 313UA_].csv",
      ["0.3UM"],
      {
        separators: "_- .()[]{}",
      },
    ),
    true,
  );
  assert.equal(
    matchFileNameAgainstPatternTokens(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM].csv",
      ["2025 1"],
      {
        separators: "_- .()[]{}",
      },
    ),
    false,
  );
});

test("matchFileNameAgainstPhrase matches raw filename phrases", () => {
  assert.equal(
    matchFileNameAgainstPhrase(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_].csv",
      "1-1-0.1UM",
    ),
    true,
  );
  assert.equal(
    matchFileNameAgainstPhrase(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_].csv",
      "1-1-0.1um",
    ),
    true,
  );
  assert.equal(
    matchFileNameAgainstPhrase(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_].csv",
      "1-1-0.1um",
      { caseSensitive: true },
    ),
    false,
  );
});
