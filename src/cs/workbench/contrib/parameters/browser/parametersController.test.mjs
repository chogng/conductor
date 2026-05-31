import test from "node:test";
import assert from "node:assert/strict";

import { runRcAnalysis } from "./parametersController.ts";

const t = (key) => key;

const createRow = (overrides = {}) => ({
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

test("runRcAnalysis rejects unavailable bridge before building payload", async () => {
  const result = await runRcAnalysis({
    curveProbeX: null,
    importService: {
      canAnalyzeRc: () => false,
      analyzeRc: async () => {
        throw new Error("unexpected");
      },
    },
    rows: [createRow(), createRow({ seriesId: "series-2" })],
    t,
  });

  assert.deepEqual(result, {
    error: "da_rc_error_bridge_unavailable",
    ok: false,
  });
});

test("runRcAnalysis validates rows before bridge call", async () => {
  const result = await runRcAnalysis({
    curveProbeX: null,
    importService: {
      canAnalyzeRc: () => true,
      analyzeRc: async () => {
        throw new Error("unexpected");
      },
    },
    rows: [createRow({ length: "" })],
    t,
  });

  assert.deepEqual(result, {
    error: "da_rc_error_insufficient_devices",
    ok: false,
  });
});

test("runRcAnalysis passes normalized devices to import service", async () => {
  let payload;
  const result = await runRcAnalysis({
    curveProbeX: 1.5,
    importService: {
      canAnalyzeRc: () => true,
      analyzeRc: async (nextPayload) => {
        payload = nextPayload;
        return {
          ok: true,
          result: { summary: { rc: 12 } },
        };
      },
    },
    rows: [createRow(), createRow({ fileId: "file-2", seriesId: "series-2" })],
    t,
  });

  assert.deepEqual(result, {
    ok: true,
    result: { summary: { rc: 12 } },
  });
  assert.equal(payload.devices.length, 2);
  assert.equal(payload.options.selectedVg, 1.5);
  assert.equal(payload.options.minDevices, 2);
});

test("runRcAnalysis returns response or thrown error messages", async () => {
  assert.deepEqual(
    await runRcAnalysis({
      curveProbeX: null,
      importService: {
        canAnalyzeRc: () => true,
        analyzeRc: async () => ({ ok: false, message: "fit failed" }),
      },
      rows: [createRow(), createRow({ seriesId: "series-2" })],
      t,
    }),
    {
      error: "fit failed",
      ok: false,
    },
  );

  assert.deepEqual(
    await runRcAnalysis({
      curveProbeX: null,
      importService: {
        canAnalyzeRc: () => true,
        analyzeRc: async () => {
          throw new Error("bridge failed");
        },
      },
      rows: [createRow(), createRow({ seriesId: "series-2" })],
      t,
    }),
    {
      error: "bridge failed",
      ok: false,
    },
  );
});
