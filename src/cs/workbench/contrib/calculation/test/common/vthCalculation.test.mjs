import assert from "node:assert/strict";
import test from "node:test";

import { computeVthSqrtFits } from "../../common/firstCalculation.ts";

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
