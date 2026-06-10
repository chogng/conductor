import assert from "assert";
import {
  computeBaseCurrentMetrics,
  isOutputLikeFile,
  isTransferLikeFile,
} from "../../common/firstCalculation.ts";

suite("workbench/services/calculation/test/common/metricCalculation", () => {
  test("isTransferLikeFile recognizes Vg sweeps", () => {
    assert.equal(isTransferLikeFile({ xAxisRole: "vg" }), true);
    assert.equal(
      isTransferLikeFile({ curveType: "transfer curve" }),
      true,
    );
    assert.equal(isTransferLikeFile({ xLabel: "Vg (V)" }), true);
    assert.equal(isTransferLikeFile({ xAxisRole: "vd" }), false);
  });

  test("isOutputLikeFile recognizes Vd sweeps", () => {
    assert.equal(isOutputLikeFile({ xAxisRole: "vd" }), true);
    assert.equal(
      isOutputLikeFile({ curveType: "output curve" }),
      true,
    );
    assert.equal(isOutputLikeFile({ xLabel: "Vd (V)" }), true);
    assert.equal(isOutputLikeFile({ xAxisRole: "vg" }), false);
  });

  test("special pv/cv/cf curve types are not treated as transfer/output-like", () => {
    for (const curveType of ["pv", "cv", "cf"]) {
      assert.equal(isTransferLikeFile({ curveType }), false);
      assert.equal(isOutputLikeFile({ curveType }), false);
      assert.equal(
        isOutputLikeFile({ curveType, supportsSs: false }),
        false,
      );
    }
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
    assert.equal(metrics.candidateWindows.length, 5);
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

  test("computeBaseCurrentMetrics uses the lowest stable window for valley off states", () => {
    const metrics = computeBaseCurrentMetrics({
      sourceFile: { xAxisRole: "vg" },
      points: [
        { x: -4, y: -1e-3 },
        { x: -3, y: -8e-4 },
        { x: -2, y: -1e-4 },
        { x: -1, y: -1e-5 },
        { x: 0, y: -2e-7 },
        { x: 1, y: -2e-8 },
        { x: 2, y: -3e-8 },
        { x: 3, y: -2e-7 },
        { x: 4, y: -1e-6 },
      ],
    });

    assert.equal(metrics.method, "auto");
    assert.equal(metrics.ioffWindow?.key, "minCurrent");
    assert.equal(metrics.xAtIoff, 1);
    assert.equal(metrics.ioff, 3e-8);
    assert.equal(metrics.ionWindow?.key, "lowEnd");
    assert.equal(metrics.xAtIon, -3);
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
    assert.equal(metrics.candidateWindows.length, 5);
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

  test("computeBaseCurrentMetrics keeps bidirectional branches separate for manual targets", () => {
    const metrics = computeBaseCurrentMetrics({
      method: "manual",
      manualTargets: {
        ionX: 1,
        ioffX: 0,
      },
      sourceFile: { xAxisRole: "vg" },
      points: [
        { x: -1, y: 1e-12 },
        { x: 0, y: 1e-11 },
        { x: 1, y: 1e-9 },
        { x: 2, y: 1e-6 },
        { x: 1, y: 2e-8 },
        { x: 0, y: 2e-12 },
        { x: -1, y: 1.5e-12 },
      ],
    });

    assert.equal(metrics.method, "manual");
    assert.equal(metrics.xAtIon, 1);
    assert.equal(metrics.xAtIoff, 0);
    assert.equal(metrics.ion, 2e-8);
    assert.equal(metrics.ioff, 2e-12);
    assert.equal(metrics.ionWindow?.label, "manual Ion (reverse)");
    assert.equal(metrics.ioffWindow?.label, "manual Ioff (reverse)");
    assert.ok(metrics.candidateWindows.some((window) => window.label.includes("(forward)")));
    assert.ok(metrics.candidateWindows.some((window) => window.label.includes("(reverse)")));
  });
});
