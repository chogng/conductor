/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  getCachedCalculationSeriesResult,
} from "src/cs/workbench/services/calculation/common/calculationCacheAccess";

suite("workbench/services/calculation/common/calculationCacheAccess", () => {
  test("reads canonical calculation cache entries", () => {
    const file = {
      calculationCache: {
        entriesByKey: {
          "gm:series-a": {
            kind: "gm",
            value: [{ x: 1, y: 2 }],
          },
        },
      },
    };

    assert.deepEqual(
      getCachedCalculationSeriesResult(file, { id: "series-a" }),
      {
        baseCurrent: undefined,
        gm: [{ x: 1, y: 2 }],
        ss: undefined,
        ssFitAuto: undefined,
      },
    );
  });

  test("does not read retired analysis cache payloads", () => {
    const file = {
      analysisCache: {
        series: {
          "series-a": {
            gm: [{ x: 1, y: 2 }],
          },
        },
        version: 2,
      },
      calculationCache: undefined,
    };

    assert.equal(getCachedCalculationSeriesResult(file, { id: "series-a" }), null);
  });
});
