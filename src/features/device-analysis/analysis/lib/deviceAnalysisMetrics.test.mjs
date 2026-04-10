import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBaseCurrentMetrics,
  isTransferLikeDeviceAnalysisFile,
} from "./deviceAnalysisMetrics.ts";

test("isTransferLikeDeviceAnalysisFile recognizes Vg sweeps", () => {
  assert.equal(isTransferLikeDeviceAnalysisFile({ xAxisRole: "vg" }), true);
  assert.equal(
    isTransferLikeDeviceAnalysisFile({ curveType: "transfer curve" }),
    true,
  );
  assert.equal(isTransferLikeDeviceAnalysisFile({ xLabel: "Vg (V)" }), true);
  assert.equal(isTransferLikeDeviceAnalysisFile({ xAxisRole: "vd" }), false);
});

test("computeBaseCurrentMetrics uses sweep endpoints for n-type transfer curves", () => {
  const metrics = computeBaseCurrentMetrics({
    sourceFile: { xAxisRole: "vg" },
    points: [
      { x: 0, y: 1e-12 },
      { x: 0.5, y: 3e-11 },
      { x: 1, y: 2e-9 },
      { x: 1.5, y: 4e-8 },
      { x: 2, y: 9e-7 },
    ],
  });

  assert.equal(metrics.method, "auto");
  assert.equal(metrics.xAtIoff, 0);
  assert.equal(metrics.ioff, 1e-12);
  assert.equal(metrics.xAtIon, 2);
  assert.equal(metrics.ion, 9e-7);
  assert.equal(metrics.candidateWindows.length, 3);
  assert.equal(metrics.ionWindow?.label, "high-end");
  assert.equal(metrics.ioffWindow?.label, "low-end");
});

test("computeBaseCurrentMetrics uses zero-bias window when it captures the off state", () => {
  const metrics = computeBaseCurrentMetrics({
    sourceFile: { curveType: "transfer" },
    points: [
      { x: -2, y: -8e-7 },
      { x: -1, y: -7e-8 },
      { x: 0, y: -2e-12 },
      { x: 1, y: 8e-8 },
      { x: 2, y: 6e-7 },
    ],
  });

  assert.equal(metrics.xAtIoff, 0);
  assert.equal(metrics.ioff, 2e-12);
  assert.equal(metrics.ion, 8e-7);
  assert.equal(metrics.xAtIon, -2);
  assert.equal(metrics.candidateWindows.some((window) => window.key === "zeroBias"), true);
  assert.equal(metrics.ioffWindow?.key, "zeroBias");
});

test("computeBaseCurrentMetrics uses manual bias targets when requested", () => {
  const metrics = computeBaseCurrentMetrics({
    method: "manual",
    manualTargets: {
      ionX: 1.5,
      ioffX: 0,
    },
    sourceFile: { xAxisRole: "vg" },
    points: [
      { x: 0, y: 1e-12 },
      { x: 0.5, y: 3e-11 },
      { x: 1, y: 2e-9 },
      { x: 1.5, y: 4e-8 },
      { x: 2, y: 9e-7 },
    ],
  });

  assert.equal(metrics.method, "manual");
  assert.equal(metrics.xAtIon, 1.5);
  assert.equal(metrics.xAtIoff, 0);
  assert.equal(metrics.ionWindow?.key, "manualIon");
  assert.equal(metrics.ioffWindow?.key, "manualIoff");
  assert.equal(metrics.candidateWindows.length, 3);
});

test("computeBaseCurrentMetrics keeps Ion and Ioff empty for non-transfer curves", () => {
  const metrics = computeBaseCurrentMetrics({
    sourceFile: { xAxisRole: "vd" },
    points: [
      { x: 0, y: 1e-12 },
      { x: 1, y: 1e-9 },
      { x: 2, y: 1e-6 },
    ],
  });

  assert.deepEqual(metrics, {
    candidateWindows: [],
    ioff: null,
    ioffWindow: null,
    ion: null,
    ionIoff: null,
    ionWindow: null,
    method: "unavailable",
    xAtIoff: null,
    xAtIon: null,
  });
});
