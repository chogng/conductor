import assert from "assert";

import { createParameterTableTsv } from "./parameterTableCopy.ts";

suite("workbench/contrib/parameters/browser/parameterTableCopy", () => {
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
        "#\tcalc_group_series\tcalc_group_on_state\t\tcalc_group_off_state\t\tcalc_group_ratio\tcalc_group_derivative\t\tcalc_group_threshold_voltage\t\tcalc_group_ss\t\tcalc_group_jon",
        "#\tcalc_group_series\t|I|on\tx\t|I|off\tx\tIon/Ioff\tgm\tx\tVth,e\tVth,h\tSS\tx\tJon",
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
        "#\tcalc_group_series\tgds\tx",
        "1\tcurve A\t...\t...",
      ].join("\n"),
    );
  });
});
