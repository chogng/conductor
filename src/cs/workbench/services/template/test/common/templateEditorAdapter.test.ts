/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createTemplateEditorRecordFromTemplate,
  createTemplateFromEditorRecord,
} from "src/cs/workbench/services/template/common/templateEditorAdapter";
import type { Template } from "src/cs/workbench/services/template/common/template";

suite("workbench/services/template/test/common/templateEditorAdapter", () => {
  test("projects canonical templates into editable template editor records", () => {
    const template = createTemplate();

    const record = createTemplateEditorRecordFromTemplate(template);

    assert.equal(record.id, "template-a");
    assert.equal(record.name, "Transfer");
    assert.equal(record.stopOnError, true);
    assert.deepEqual(record.xColumns, [0]);
    assert.deepEqual(record.yColumns, [1]);
    assert.deepEqual(record.xRanges, [{ start: "A2", end: "A4" }]);
    assert.equal(record.xSegmentationMode, "points");
    assert.equal(record.xPointsPerGroup, "12");
    assert.equal(record.xUnit, "V");
    assert.equal(record.yLegendTarget, "group");
    assert.equal(record.yUnit, "A");
    assert.equal(record.bottomTitle, "Gate");
    assert.equal(record.leftTitle, "Drain");
    assert.equal(record.legendPrefix, "Vd");
  });

  test("round trips editable template editor records through canonical templates", () => {
    const template = createTemplate();

    const record = createTemplateEditorRecordFromTemplate(template);
    const { template: _template, ...editableRecord } = record;
    const roundTripped = createTemplateFromEditorRecord(editableRecord);

    assert.equal(roundTripped?.id, "template-a");
    assert.equal(roundTripped?.name, "Transfer");
    assert.equal(roundTripped?.blocks[0]?.rowRange.startRow, 1);
    assert.equal(roundTripped?.blocks[0]?.rowRange.endRow, 3);
    assert.deepEqual(roundTripped?.blocks[0]?.x.columns, [0]);
    assert.deepEqual(roundTripped?.blocks[0]?.y.columns, [1]);
  });
});

const createTemplate = (): Template => ({
  schemaVersion: 1,
  id: "template-a",
  name: "Transfer",
  version: 4,
  stopOnError: true,
  blocks: [{
    rowRange: {
      startRow: 1,
      endRow: 3,
    },
    x: {
      columns: [0],
      ranges: [{
        column: 0,
        startRow: 1,
        endRow: 3,
      }],
      unit: "V",
    },
    y: {
      columns: [1],
      unit: "A",
    },
    segmentation: {
      kind: "fixedPoints",
      pointsPerGroup: 12,
    },
    legend: {
      target: "group",
      prefix: "Vd",
    },
    titles: {
      bottom: "Gate",
      left: "Drain",
    },
  }],
});
