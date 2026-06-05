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
    assert.equal(rows[0].name, "Curve A");
    assert.equal(rows[0].gmMaxAbs, 4);
    assert.equal(rows[0].xAtGmMaxAbs, 2);
    assert.equal(rows[0].ssConfidence, "fail");
  });
});
