/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  clearPerfEntries,
  getPerfEntries,
  startPerf,
} from "src/cs/workbench/common/perf";

suite("workbench/common/perf", () => {
  teardown(() => {
    clearPerfEntries();
  });

  test("keeps startPerf end logging silent when requested", () => {
    const restore = enablePerfForTest();
    let consoleCount = 0;
    console.info = () => {
      consoleCount += 1;
    };
    try {
      const endPerf = startPerf("table.parser.parse", {}, { silent: true });
      endPerf({ success: true });

      assert.equal(consoleCount, 0);
      assert.equal(getPerfEntries().length, 1);
      assert.equal(getPerfEntries()[0]?.stage, "table.parser.parse");
    } finally {
      restore();
    }
  });
});

const enablePerfForTest = (): (() => void) => {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousConsoleInfo = console.info;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => key === "conductor.perf" ? "1" : null,
    },
  });
  clearPerfEntries();
  return () => {
    clearPerfEntries();
    console.info = previousConsoleInfo;
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  };
};
