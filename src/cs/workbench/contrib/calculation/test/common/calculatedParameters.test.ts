import assert from "assert";

import { createParameterRows } from "../../common/calculatedParameters.ts";

suite("workbench/contrib/calculation/test/common/calculatedParameters", () => {
  test("createParameterRows keeps base current metrics and derived gm metrics in calculation", () => {
    const rows = createParameterRows({
      fileId: "file-a",
      fileName: "file-a.csv",
      xGroups: [[0, 1, 2]],
      xUnit: "V",
      yUnit: "A",
      series: [
        {
          id: "series-a",
          groupIndex: 0,
          name: "Curve A",
          y: [1, 3, 7],
        },
      ],
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "series-a");
    assert.equal(rows[0].name, "#1");
    assert.equal(rows[0].gmMaxAbs, 4);
    assert.equal(rows[0].xAtGmMaxAbs, 2);
    assert.equal(rows[0].ssConfidence, "fail");
  });

  test("createParameterRows splits legend label from numeric value", () => {
    const rows = createParameterRows({
      fileId: "file-a",
      fileName: "file-a.csv",
      xGroups: [[0, 1, 2]],
      xUnit: "V",
      yUnit: "A",
      series: [
        {
          id: "series-a",
          groupIndex: 0,
          legendValue: "Vg=-60",
          y: [1, 3, 7],
        },
      ],
    });

    assert.equal(rows[0].legendHeader, "Vg");
    assert.equal(rows[0].name, "-60");
  });

  test("createParameterRows falls back to ordered labels when legend is missing", () => {
    const rows = createParameterRows({
      fileId: "file-a",
      fileName: "file-a.csv",
      xGroups: [[0, 1, 2], [0, 1, 2]],
      xUnit: "V",
      yUnit: "A",
      series: [
        {
          id: "series-a",
          groupIndex: 0,
          name: "Curve A",
          y: [1, 3, 7],
        },
        {
          id: "series-b",
          groupIndex: 1,
          y: [2, 4, 8],
        },
      ],
    });

    assert.equal(rows[0].legendHeader, null);
    assert.equal(rows[0].name, "#1");
    assert.equal(rows[1].legendHeader, null);
    assert.equal(rows[1].name, "#2");
  });

  test("createParameterRows parses generated legend-like series names", () => {
    const rows = createParameterRows({
      fileId: "file-a",
      fileName: "file-a.csv",
      xGroups: [[0, 1, 2]],
      xUnit: "V",
      yUnit: "A",
      series: [
        {
          id: "series-a",
          groupIndex: 0,
          name: "Vg=-40",
          y: [1, 3, 7],
        },
      ],
    });

    assert.equal(rows[0].legendHeader, "Vg");
    assert.equal(rows[0].name, "-40");
  });
});
