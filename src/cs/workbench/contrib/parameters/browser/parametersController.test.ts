/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { runRcCalculation } from "./parametersController.ts";

suite("workbench/contrib/parameters/browser/parametersController", () => {
  const createRow = (overrides: Record<string, unknown> = {}) => ({
    fileId: "file",
    fileName: "sample",
    label: "curve",
    length: 10,
    seriesId: "series",
    vds: 0.1,
    width: 5,
    x: [0, 1, 2],
    y: [1, 2, 3],
    ...overrides,
  });

  test("runRcCalculation rejects unavailable bridge before building payload", async () => {
    const result = await runRcCalculation({
      curveProbeX: null,
      rcCalculationBackendService: {
        canCalculateRc: () => false,
        calculateRc: async () => {
          throw new Error("unexpected");
        },
      },
      rows: [createRow(), createRow({ seriesId: "series-2" })],
    });

    assert.deepEqual(result, {
      error: "parameters.rc.error.bridgeUnavailable",
      ok: false,
    });
  });

  test("runRcCalculation validates rows before bridge call", async () => {
    const result = await runRcCalculation({
      curveProbeX: null,
      rcCalculationBackendService: {
        canCalculateRc: () => true,
        calculateRc: async () => {
          throw new Error("unexpected");
        },
      },
      rows: [createRow({ length: "" })],
    });

    assert.deepEqual(result, {
      error: "parameters.rc.error.insufficientDevices",
      ok: false,
    });
  });

  test("runRcCalculation passes normalized devices to rc calculation backend", async () => {
    let payload: {
      devices: readonly unknown[];
      options: {
        minDevices: number;
        selectedVg: number | null;
      };
    } | undefined;
    const result = await runRcCalculation({
      curveProbeX: 1.5,
      rcCalculationBackendService: {
        canCalculateRc: () => true,
        calculateRc: async (nextPayload) => {
          payload = nextPayload;
          return {
            ok: true,
            result: { summary: { rc: 12 } },
          };
        },
      },
      rows: [createRow(), createRow({ fileId: "file-2", seriesId: "series-2" })],
    });

    assert.deepEqual(result, {
      ok: true,
      result: { summary: { rc: 12 } },
    });
    assert.ok(payload);
    assert.equal(payload.devices.length, 2);
    assert.equal(payload.options.selectedVg, 1.5);
    assert.equal(payload.options.minDevices, 2);
  });

  test("runRcCalculation returns response or thrown error messages", async () => {
    assert.deepEqual(
      await runRcCalculation({
        curveProbeX: null,
        rcCalculationBackendService: {
          canCalculateRc: () => true,
          calculateRc: async () => ({ ok: false, message: "fit failed" }),
        },
        rows: [createRow(), createRow({ seriesId: "series-2" })],
      }),
      {
        error: "fit failed",
        ok: false,
      },
    );

    assert.deepEqual(
      await runRcCalculation({
        curveProbeX: null,
        rcCalculationBackendService: {
          canCalculateRc: () => true,
          calculateRc: async () => {
            throw new Error("bridge failed");
          },
        },
        rows: [createRow(), createRow({ seriesId: "series-2" })],
      }),
      {
        error: "bridge failed",
        ok: false,
      },
    );
  });
});
