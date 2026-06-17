import assert from "assert";

import {
  chooseColumnScaleExponent,
  formatCell,
  parseNumericCell,
  toScaleHeaderSuffix,
} from "src/cs/workbench/services/table/common/numericFormat";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/table/common/numericFormat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("parses finite numeric cells only", () => {
    assert.equal(parseNumericCell("-3.70327E-009"), -3.70327e-9);
    assert.equal(parseNumericCell("810.09486E+006"), 810.09486e6);
    assert.equal(parseNumericCell("N/A"), null);
    assert.equal(parseNumericCell("Infinity"), null);
    assert.equal(parseNumericCell(""), null);
  });

  test("chooses engineering scale exponent from column values", () => {
    assert.equal(chooseColumnScaleExponent([-3.70327e-9, 4.2e-9]), -9);
    assert.equal(chooseColumnScaleExponent([810.09486e6, 200e6]), 6);
    assert.equal(chooseColumnScaleExponent([-3, 5]), 0);
    assert.equal(chooseColumnScaleExponent([0, 0]), 0);
  });

  test("formats scaled cells with a column profile and leaves invalid tokens raw", () => {
    const profile: ColumnDisplayProfile = {
      rawTableId: "table-a",
      columnId: "1",
      mode: "columnScale",
      isNumericColumn: true,
      scaleExponent: -9,
      headerSuffix: toScaleHeaderSuffix(-9),
      significantDigits: 6,
      sourceVersion: 1,
      settingsVersion: 2,
    };

    assert.equal(profile.headerSuffix, "×10⁻⁹");
    assert.equal(formatCell("-3.70327E-009", profile), "-3.70327");
    assert.equal(formatCell("N/A", profile), "N/A");
  });
});

