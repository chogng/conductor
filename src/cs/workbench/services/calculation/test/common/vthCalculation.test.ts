import assert from "assert";

import {
  computeVthSqrtFits,
  createVthSqrtPoints,
} from "../../common/firstCalculation.ts";

suite("workbench/services/calculation/test/common/vthCalculation", () => {
  test("computeVthSqrtFits fits electron and hole branches around the valley", () => {
    const points = [];
    for (let x = -5; x <= 5; x += 1) {
      points.push({ x, y: x * x });
    }

    const fits = computeVthSqrtFits(points);
    const electron = fits.find((fit) => fit.branch === "electron");
    const hole = fits.find((fit) => fit.branch === "hole");

    assert.ok(electron);
    assert.ok(hole);
    assert.equal(electron.slope > 0, true);
    assert.equal(hole.slope < 0, true);
    assert.equal(Math.abs(electron.vth) < 1e-9, true);
    assert.equal(Math.abs(hole.vth) < 1e-9, true);
  });

  test("createVthSqrtPoints filters invalid points and uses current magnitude", () => {
    assert.deepEqual(createVthSqrtPoints([
      { x: -1, y: -4 },
      { x: "0", y: "9" },
      { x: "bad", y: 16 },
      { x: 1, y: Number.NaN },
      null,
    ]), [
      { x: -1, y: 2 },
      { x: 0, y: 3 },
    ]);
  });

  test("computeVthSqrtFits returns no fits for undersized or flat data", () => {
    assert.deepEqual(computeVthSqrtFits([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
    ]), []);

    assert.deepEqual(computeVthSqrtFits([
      { x: -3, y: 1 },
      { x: -2, y: 1 },
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]), []);
  });
});
