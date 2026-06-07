import assert from "assert";

import {
  createMinorTicks,
  createPlotMainLayout,
  createTicks,
  normalizeDomain,
} from "../../common/plotMainLayout.ts";

suite("workbench/contrib/plot/test/common/plotMainLayout", () => {
  test("normalizes invalid and flat domains", () => {
    assert.deepEqual(normalizeDomain([Number.NaN, 1]), [0, 1]);
    assert.deepEqual(normalizeDomain([4, 4]), [3.5, 4.5]);
    assert.deepEqual(normalizeDomain([5, 2]), [2, 5]);
  });

  test("uses requested ticks when available", () => {
    assert.deepEqual(createTicks([0, 10], [0, 2, Number.NaN, 10]), [0, 2, 10]);
  });

  test("creates minor ticks between major ticks and clamps to domain", () => {
    assert.deepEqual(createMinorTicks([0, 10], [0, 10], 1), [5]);
    assert.deepEqual(createMinorTicks([0, 10, 20], [0, 15], 1), [5]);
  });

  test("creates full axis layout only when axes are visible", () => {
    const layout = createPlotMainLayout(800, 400, {
      minorTickCount: 1,
      showAxes: true,
      xDomain: [0, 10],
      yDomain: [0, 100],
    });
    assert.equal(layout.plotRect.left, 96);
    assert.equal(layout.plotRect.top, 20);
    assert.equal(layout.plotRect.bottom, 326);
    assert.equal(layout.xTicks.length, 5);
    assert.equal(layout.yTicks.length, 5);
    assert.equal(layout.xMinorTicks.length, 4);

    const preview = createPlotMainLayout(800, 400, {
      showAxes: false,
      xDomain: [0, 10],
      yDomain: [0, 100],
    });
    assert.equal(preview.plotRect.left, 10);
    assert.deepEqual(preview.xTicks, []);
    assert.deepEqual(preview.yMinorTicks, []);
  });
});
