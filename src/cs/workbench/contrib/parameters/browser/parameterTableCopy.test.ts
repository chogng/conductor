import assert from "assert";

import { createParameterTableTsv } from "./parameterTableCopy.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/parameters/browser/parameterTableCopy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const row = {
    gmMaxAbs: 1.2345,
    ion: 2,
    ionIoff: 3000,
    ioff: 4,
    jon: 5,
    name: "curve\tA",
    ss: 78.912,
    ssConfidence: "high" as const,
    thresholdVoltage: null,
    thresholdVoltageElectron: 0.7,
    thresholdVoltageHole: -0.6,
    xAtGmMaxAbs: 6,
    xAtIon: 7,
    xAtIoff: 8,
    xAtSs: 9,
  };

  test("createParameterTableTsv includes grouped transfer headers and row numbers", () => {
    assert.equal(
      createParameterTableTsv({
        gmMetricHeader: "gm",
        rows: [row],
        showTransferMetrics: true,
      }),
      [
        "#\tparameters.metricGroups.series\tparameters.metricGroups.onState\t\tparameters.metricGroups.offState\t\tparameters.metricGroups.ratio\tparameters.metricGroups.derivative\t\tparameters.metricGroups.thresholdVoltage\t\tparameters.metricGroups.subthreshold\t\tparameters.metricGroups.currentDensity",
        "#\tparameters.metricGroups.series\t|I|on\tx\t|I|off\tx\tIon/Ioff\tgm\tx\tVth,e\tVth,h\tSS\tx\tJon",
        "1\tcurve A\t2\t7\t4\t8\t3000\t1.2345\t6\t0.7\t-0.6\t78.91\t9\t5",
      ].join("\n"),
    );
  });

  test("createParameterTableTsv keeps derivative-only tables narrow", () => {
    assert.equal(
      createParameterTableTsv({
        gmMetricHeader: "gds",
        rows: [{ ...row, isPending: true }],
        showTransferMetrics: false,
      }),
      [
        "#\tparameters.metricGroups.series\tgds\tx",
        "1\tcurve A\t...\t...",
      ].join("\n"),
    );
  });
});
