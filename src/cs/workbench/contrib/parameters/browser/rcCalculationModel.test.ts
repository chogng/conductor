import assert from "assert";

import {
  createRcCalculateDevices,
  createRcCurveChart,
  getRcStatusText,
} from "./rcCalculationModel.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/parameters/browser/rcCalculationModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createRcCalculateDevices keeps only complete device rows", () => {
    const devices = createRcCalculateDevices([
      {
        fileId: "file-a",
        fileName: "A",
        label: "L=1",
        length: "10",
        seriesId: "s1",
        vds: "0.1",
        width: "2",
        x: [0, 1],
        y: [1e-9, 2e-9],
      },
      {
        fileId: "file-b",
        fileName: "B",
        label: "missing width",
        length: "10",
        seriesId: "s2",
        vds: "0.1",
        width: "",
        x: [0, 1],
        y: [1e-9, 2e-9],
      },
    ]);

    assert.equal(devices.length, 1);
    assert.equal(devices[0].label, "A / L=1");
    assert.deepEqual(devices[0].x, [0, 1]);
  });

  test("createRcCurveChart creates chart series from RC rows", () => {
    const chart = createRcCurveChart([
      { vg: 1, rc: 10, rcw: 20, rSheet: 30 },
      { vg: 0, rc: 12, rcw: 22, rSheet: 32 },
    ]);

    assert.ok(chart);
    assert.equal(chart.series.length, 3);
    assert.deepEqual(chart.series[0].data.map((point) => point.x), [0, 1]);
    assert.equal(chart.xTicks.length > 0, true);
    assert.equal(chart.yTicks.length > 0, true);
  });

  test("getRcStatusText formats pending, error, summary, and selection states", () => {
    assert.equal(
      getRcStatusText({ error: "", isPending: true, rowCount: 2, summary: null }),
      "parameters.rc.status.running",
    );
    assert.equal(
      getRcStatusText({ error: "bad", isPending: false, rowCount: 2, summary: null }),
      "bad",
    );
    assert.equal(
      getRcStatusText({
        error: "",
        isPending: false,
        rowCount: 2,
        summary: { r2: 0.98765, rc: 10, rcw: 20 },
      }),
      "Rc=10 | RcW=20 | R2=0.98765",
    );
    assert.equal(
      getRcStatusText({ error: "", isPending: false, rowCount: 3, summary: null }),
      'parameters.rc.status.selectedCurves:{"count":3}',
    );
  });
});
