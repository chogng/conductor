import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAxisTitleOverridesByFileId,
  normalizePlotYScale,
  normalizeLogCurrentMode,
  normalizeSeriesLegendLabelsByFileId,
  normalizeVisibleSeriesByFileId,
  normalizeYLogCurrentModeByFileIdRecord,
  normalizeYScaleByFileIdRecord,
} from "../../browser/plotModel.ts";

test("normalizeVisibleSeriesByFileId trims ids and removes duplicates", () => {
  assert.deepEqual(
    normalizeVisibleSeriesByFileId({
      " file-a ": [" s1 ", "s1", "", null, "s2"],
      empty: [],
      bad: "s3",
      "": ["ignored"],
    }),
    {
      "file-a": ["s1", "s2"],
      empty: [],
    },
  );
});

test("normalizeSeriesLegendLabelsByFileId keeps only usable labels", () => {
  assert.deepEqual(
    normalizeSeriesLegendLabelsByFileId({
      file: {
        " s1 ": " Drain ",
        s2: "",
      },
      empty: {
        s3: "",
      },
    }),
    {
      file: {
        s1: "Drain",
      },
    },
  );
});

test("normalizeAxisTitleOverridesByFileId keeps x and y labels only", () => {
  assert.deepEqual(
    normalizeAxisTitleOverridesByFileId({
      file: {
        x: " Gate ",
        y: " Current ",
        z: "ignored",
      },
      empty: {
        x: "",
      },
    }),
    {
      file: {
        x: "Gate",
        y: "Current",
      },
    },
  );
});

test("normalizes plot scale records", () => {
  assert.equal(normalizePlotYScale("logAbs"), "logAbs");
  assert.equal(normalizePlotYScale("LOG"), "log");
  assert.equal(normalizePlotYScale("other"), "linear");
  assert.equal(normalizeLogCurrentMode("positive"), "positive");
  assert.equal(normalizeLogCurrentMode("all"), "all");
  assert.deepEqual(normalizeYScaleByFileIdRecord({ a: "log", b: "bad" }), {
    a: "log",
    b: "linear",
  });
  assert.deepEqual(normalizeYLogCurrentModeByFileIdRecord({ a: "positive", b: "all" }), {
    a: "positive",
    b: "all",
  });
});
