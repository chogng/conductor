/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export const b1500IvTransferTemplate = {
  schemaVersion: 1,
  id: "builtin.b1500.iv.transfer",
  name: "B1500 IV Transfer",
  version: 1,
  blocks: [{
    rowRange: {
      startRow: 1,
      endRow: "end",
    },
    x: {
      columns: [0],
      unit: "V",
    },
    y: {
      columns: [1],
      unit: "A",
    },
    segmentation: {
      kind: "auto",
    },
    legend: {
      target: "auto",
    },
    titles: {
      bottom: "Vg",
      left: "Id",
    },
  }],
  stopOnError: false,
  applicability: {
    columnCount: 2,
  },
} as const satisfies Template;

export const builtinTemplateSpecs = [
  b1500IvTransferTemplate,
] as const satisfies readonly Template[];
