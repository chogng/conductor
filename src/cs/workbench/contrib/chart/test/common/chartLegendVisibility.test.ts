import assert from "assert";

import type { CalculatedData } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { filterCalculatedDataSeries } from "../../common/chartLegendVisibility.ts";

suite("workbench/contrib/chart/test/common/chartLegendVisibility", () => {
  test("filters hidden legend items and recomputes domains", () => {
    const model = createModel();

    const filtered = filterCalculatedDataSeries(model, ["series-b"]);

    assert.deepEqual(filtered.seriesList.map((series) => series.id), ["series-a"]);
    assert.equal(filtered.pointsCount, 2);
    assert.deepEqual(filtered.xDomain, [0, 1]);
    assert.deepEqual(filtered.yDomain, [10, 20]);
  });

  test("keeps source domains when all legend items are hidden", () => {
    const model = createModel();

    const filtered = filterCalculatedDataSeries(model, ["series-a", "series-b"]);

    assert.deepEqual(filtered.seriesList, []);
    assert.equal(filtered.pointsCount, 0);
    assert.deepEqual(filtered.xDomain, [-2, 1]);
    assert.deepEqual(filtered.yDomain, [-20, 20]);
  });
});

const createModel = (): CalculatedData => ({
  activeFile: null,
  kind: "iv",
  pointsCount: 4,
  seriesList: [
    {
      data: [
        { x: 0, y: 10, yAbsPositive: 10, yPositive: 10 },
        { x: 1, y: 20, yAbsPositive: 20, yPositive: 20 },
      ],
      id: "series-a",
      kind: "iv",
      name: "A",
    },
    {
      data: [
        { x: -2, y: -20, yAbsPositive: 20, yPositive: null },
        { x: -1, y: -10, yAbsPositive: 10, yPositive: null },
      ],
      id: "series-b",
      kind: "iv",
      name: "B",
    },
  ],
  source: {
    fileId: "file-a",
    inputKind: "cleaned",
  },
  xDomain: [-2, 1],
  xUnitLabel: "V",
  yDomain: [-20, 20],
  yUnitLabel: "A",
});
