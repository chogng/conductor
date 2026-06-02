import test from "node:test";
import assert from "node:assert/strict";
import {
  collectFileNameFieldCandidates,
  DEFAULT_FILE_NAME_FIELD_SEPARATORS,
  deriveFileNameFieldSuggestions,
  matchFileNameAgainstPhrase,
  matchFileNameAgainstPatternTokens,
  normalizeFileNameFieldSeparators,
  stripFileExtension,
  tokenizeFileNameFields,
} from "../common/fileNameMatching.ts";

test("normalizeFileNameFieldSeparators falls back to defaults", () => {
  assert.equal(
    normalizeFileNameFieldSeparators(""),
    DEFAULT_FILE_NAME_FIELD_SEPARATORS,
  );
});

test("tokenizeFileNameFields splits filenames into normalized fields", () => {
  assert.deepEqual(tokenizeFileNameFields("Trans_xxxxx.csv"), ["trans", "xxxxx"]);
  assert.deepEqual(
    tokenizeFileNameFields("Output(25)-A01.csv", {
      separators: "_- ()",
    }),
    ["output", "25", "a01"],
  );
  assert.deepEqual(
    tokenizeFileNameFields("TransSweep001.csv", {
      separators: "_- ",
    }),
    ["trans", "sweep", "001"],
  );
});

test("stripFileExtension keeps semantic dot fragments inside the base name", () => {
  assert.equal(
    stripFileExtension(
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM].csv",
    ),
    "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM]",
  );
});

test("collectFileNameFieldCandidates keeps semantic chunks and split fields", () => {
  const candidates = collectFileNameFieldCandidates(
    "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM].csv",
    {
      separators: "_- .()[]{}",
      caseSensitive: true,
    },
  );

  assert.equal(candidates.includes("1-1-0.1UM"), true);
  assert.equal(candidates.includes("313UA"), true);
  assert.equal(candidates.includes("Lc200nm"), true);
  assert.equal(candidates.includes("Lc200nm(1)"), true);
  assert.equal(candidates.includes("Output"), true);
  assert.equal(candidates.includes("TLM"), true);
  assert.equal(candidates.includes("2025 1"), false);
  assert.equal(candidates.includes("51 AM"), false);
  assert.equal(candidates.includes("TLM #1_Lc200nm(1) _1-1-0.1UM"), false);
});

test("collectFileNameFieldCandidates derives embedded measurement fields", () => {
  const candidates = collectFileNameFieldCandidates(
    "Output [TLM #1_Lc200nm(1) _1-1-0.3UM, 313UA_].csv",
    {
      separators: "_- .()[]{}",
      caseSensitive: true,
    },
  );

  assert.equal(candidates.includes("1-1-0.3UM"), true);
  assert.equal(candidates.includes("1-1"), true);
  assert.equal(candidates.includes("0.3UM"), true);
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

test("deriveFileNameFieldSuggestions prioritizes descriptive tokens", () => {
  const suggestions = deriveFileNameFieldSuggestions(
    [
      "Trans_0001.csv",
      "Trans_0002.csv",
      "Output_0003.csv",
      "Output [TLM #1_Lc200nm(1) _1-1-0.1UM, 313UA_; 7_12_2025 1_01_51 AM].csv",
    ],
    {
      separators: "_- .()[]{}",
    },
  );

  assert.equal(
    suggestions.some((entry) => entry.value === "Trans" && entry.count === 2),
    true,
  );
  assert.equal(
    suggestions.some((entry) => entry.value === "0001"),
    false,
  );
  assert.equal(
    suggestions.some((entry) => entry.value === "1-1-0.1UM"),
    true,
  );
  assert.equal(
    suggestions.some((entry) => entry.value === "AM"),
    false,
  );
  assert.equal(
    suggestions.some((entry) => entry.value === "2025"),
    false,
  );
});

test("deriveFileNameFieldSuggestions keeps repeated measurement fields visible", () => {
  const files = Array.from(
    { length: 6 },
    (_, index) =>
      `Output [TLM #1_Lc200nm(1) _1-1-0.3UM, 313UA_; 7_12_2025 1_01_5${index} AM].csv`,
  );
  const suggestions = deriveFileNameFieldSuggestions(files, {
    separators: "_- .()[]{}",
  });

  assert.equal(
    suggestions.some((entry) => entry.value === "0.3UM" && entry.count === 6),
    true,
  );
  assert.equal(
    suggestions.some((entry) => entry.value === "1-1" && entry.count === 6),
    true,
  );
});
