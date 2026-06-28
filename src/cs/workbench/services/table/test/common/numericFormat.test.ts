import assert from "assert";

import {
  chooseColumnScaleExponent,
  chooseColumnScaleExponentFromCells,
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
    assert.equal(parseNumericCell(null), null);
  });

  test("chooses engineering scale exponent from column values", () => {
    assert.equal(chooseColumnScaleExponent([-3.70327e-9, 4.2e-9]), -9);
    assert.equal(chooseColumnScaleExponent([810.09486e6, 200e6]), 6);
    assert.equal(chooseColumnScaleExponent([-3, 5]), 0);
    assert.equal(chooseColumnScaleExponent([1e-12, 9e-12]), -12);
    assert.equal(chooseColumnScaleExponent([2e12, 9e12]), 12);
    assert.equal(chooseColumnScaleExponent([0, 0]), 0);
  });

  test("uses a single median scale for wide magnitude columns", () => {
    assert.equal(chooseColumnScaleExponent([1e-12, 1e-3, 1e6]), -3);
  });

  test("uses scientific notation density as a column scale signal", () => {
    assert.equal(
      chooseColumnScaleExponentFromCells(["1.000000", "-2.76E-009", "-3.00E-009", "1.100000"]),
      -9,
    );
    assert.equal(
      chooseColumnScaleExponentFromCells(["0", "", "0.00000000276", "0.00000000310"]),
      -9,
    );
  });

  test("prefers an adjacent lower scale to avoid buried zero displays", () => {
    assert.equal(
      chooseColumnScaleExponentFromCells([
        "-3.70327E-009",
        "-3.49201E-009",
        ...Array.from({ length: 200 }, (_, index) => `-${(3 + index / 100).toFixed(5)}E-006`),
      ]),
      -6,
    );

    assert.equal(
      chooseColumnScaleExponentFromCells([
        ...Array.from({ length: 24 }, (_, index) => `-${(3 + index / 100).toFixed(5)}E-009`),
        ...Array.from({ length: 200 }, (_, index) => `-${(3 + index / 100).toFixed(5)}E-006`),
      ]),
      -9,
    );

    assert.equal(
      chooseColumnScaleExponentFromCells([
        "-8.70000E-013",
        ...Array.from({ length: 59 }, (_, index) => `${(1 + index / 100).toFixed(5)}E-012`),
        ...Array.from({ length: 604 }, (_, index) => `${(1 + index / 100).toFixed(5)}E-009`),
        ...Array.from({ length: 743 }, (_, index) => `${(1 + index / 100).toFixed(5)}E-006`),
      ]),
      -9,
    );

    assert.equal(
      chooseColumnScaleExponentFromCells([
        "1E-012",
        "1E-003",
        "1E+006",
      ]),
      -3,
    );

    assert.equal(
      chooseColumnScaleExponentFromCells([
        ...Array.from({ length: 5 }, () => "1E-007"),
        ...Array.from({ length: 462 }, (_, index) => `${(0.15 + index / 1000).toFixed(6)}`),
        ...Array.from({ length: 938 }, (_, index) => `${(1 + index / 1000).toFixed(6)}`),
      ]),
      0,
    );

    assert.equal(
      chooseColumnScaleExponentFromCells([
        ...Array.from({ length: 2 }, () => "308.11893"),
        ...Array.from({ length: 697 }, (_, index) => `${(67 + index / 10).toFixed(5)}E+003`),
        ...Array.from({ length: 703 }, (_, index) => `${(810 + index / 10).toFixed(5)}E+006`),
        ...Array.from({ length: 3 }, () => "1.03100E+009"),
      ]),
      6,
    );
  });

  test("formats scaled cells with a column profile and leaves invalid tokens raw", () => {
    const profile: ColumnDisplayProfile = {
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
    assert.equal(formatCell("-0.00000000276", profile), "-2.76");
    assert.equal(formatCell("N/A", profile), "N/A");
    assert.equal(formatCell("", profile), "");

    const milliProfile: ColumnDisplayProfile = {
      ...profile,
      scaleExponent: -3,
      headerSuffix: toScaleHeaderSuffix(-3),
    };
    assert.equal(formatCell("-0.002900000", milliProfile), "-2.9");

    const rawScaleProfile: ColumnDisplayProfile = {
      ...profile,
      scaleExponent: 0,
      headerSuffix: undefined,
    };
    assert.equal(formatCell("1.000000", rawScaleProfile), "1");
    assert.equal(formatCell("-2.97001E+000", rawScaleProfile), "-2.97001");
    assert.equal(formatCell("-3.00000E+000", rawScaleProfile), "-3");
    assert.equal(formatCell("125.47200E-003", rawScaleProfile), "0.125472");
    assert.equal(formatCell("9.64800E-003", rawScaleProfile), "0.009648");
    assert.equal(formatCell("1019.80000E+006", {
      ...profile,
      scaleExponent: 6,
      headerSuffix: toScaleHeaderSuffix(6),
    }), "1019.8");
    assert.equal(formatCell("810.09486E+006", {
      ...profile,
      scaleExponent: 7,
      headerSuffix: toScaleHeaderSuffix(7),
    }), "81.0095");
    assert.equal(formatCell("810.09486E+006", {
      ...profile,
      scaleExponent: 7,
      headerSuffix: toScaleHeaderSuffix(7),
      significantDigits: 4,
    }), "81.01");
    assert.equal(formatCell("81.009486", {
      ...rawScaleProfile,
      significantDigits: 4,
    }), "81.01");
    assert.equal(formatCell("1.000000", {
      ...rawScaleProfile,
      mode: "raw",
      isNumericColumn: false,
    }), "1.000000");
  });
});
