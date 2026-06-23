/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createTemplateSlicePlan,
  normalizeTemplateSliceFilePrefix,
} from "src/cs/workbench/contrib/files/browser/sliceWithTemplate";
import {
  resolveTemplateSliceTemplatesForState,
  resolveTemplateSliceSelectedTemplateId,
} from "src/cs/workbench/contrib/files/browser/sliceWithTemplateController";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { TemplateState } from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import type { TemplateApplyPresetRecord } from "src/cs/workbench/services/template/common/template";
import { createEmptyTemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import { createTemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";

suite("workbench/contrib/files/test/browser/sliceWithTemplate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("creates CSV slices from template segment count", () => {
    const plan = createTemplateSlicePlan({
      csvText: "Vg,Id\n0,10\n1,11\n0,12\n1,13\n0,14\n1,15",
      filePrefixName: "transfer",
      template: createTemplate({
        xDataStart: "A2",
        xDataEnd: "A7",
        xSegmentationMode: "segments",
        xSegmentCount: "3",
      }),
    });

    assert.equal(plan.groupSize, 2);
    assert.equal(plan.totalDataRows, 6);
    assert.deepEqual(plan.slices.map(slice => slice.fileName), [
      "transfer_1.csv",
      "transfer_2.csv",
      "transfer_3.csv",
    ]);
    assert.equal(plan.slices[0].content, "Vg,Id\n0,10\n1,11\n");
    assert.equal(plan.slices[2].content, "Vg,Id\n0,14\n1,15\n");
  });

  test("creates CSV slices from template points per group", () => {
    const plan = createTemplateSlicePlan({
      csvText: "Vg,Id\n0,10\n1,11\n2,12\n3,13",
      filePrefixName: "output file",
      template: createTemplate({
        xDataStart: "A2",
        xDataEnd: "A5",
        xPointsPerGroup: "2",
        xSegmentationMode: "points",
      }),
    });

    assert.equal(plan.groupSize, 2);
    assert.deepEqual(plan.slices.map(slice => slice.fileName), [
      "output_file_1.csv",
      "output_file_2.csv",
    ]);
  });

  test("creates CSV slices from paired template selections", () => {
    const plan = createTemplateSlicePlan({
      csvText: [
        "meta,,,CH1 Voltage,CH1 Current,CH1 Resistance,CH1 Time,CH2 Voltage,CH2 Current,CH2 Resistance,CH2 Time",
        "row,,,0,10,100,0.1,-60,20,200,0.2",
        "row,,,1,11,101,0.3,-60,21,201,0.4",
      ].join("\n"),
      filePrefixName: "device",
      template: createTemplate({
        xRanges: [
          { start: "D2", end: "D3" },
          { start: "H2", end: "H3" },
        ],
        yColumns: [4, 8],
      }),
    });

    assert.equal(plan.groupSize, 2);
    assert.equal(plan.totalDataRows, 2);
    assert.deepEqual(plan.slices.map(slice => slice.fileName), [
      "device_1.csv",
      "device_2.csv",
    ]);
    assert.equal(plan.slices[0].content, [
      "CH1 Voltage,CH1 Current",
      "0,10",
      "1,11",
      "",
    ].join("\n"));
    assert.equal(plan.slices[1].content, [
      "CH2 Voltage,CH2 Current",
      "-60,20",
      "-60,21",
      "",
    ].join("\n"));
  });

  test("keeps only selected columns for a single X range with multiple Y columns", () => {
    const plan = createTemplateSlicePlan({
      csvText: [
        "X,drop,Y1,drop,Y2",
        "0,unused,10,unused,20",
        "1,unused,11,unused,21",
      ].join("\n"),
      filePrefixName: "selected",
      template: createTemplate({
        xDataStart: "A2",
        xDataEnd: "A3",
        yColumns: [2, 4],
      }),
    });

    assert.deepEqual(plan.slices.map(slice => slice.fileName), [
      "selected_1.csv",
    ]);
    assert.equal(plan.slices[0].content, [
      "X,Y1,Y2",
      "0,10,20",
      "1,11,21",
      "",
    ].join("\n"));
  });

  test("rejects templates whose segmentation cannot divide the X range", () => {
    assert.throws(
      () => createTemplateSlicePlan({
        csvText: "Vg,Id\n0,10\n1,11\n2,12\n3,13\n4,14",
        filePrefixName: "bad",
        template: createTemplate({
          xDataStart: "A2",
          xDataEnd: "A6",
          xSegmentCount: "2",
          xSegmentationMode: "segments",
        }),
      }),
      /not divisible/,
    );
  });

  test("normalizes file prefixes for generated slice names", () => {
    assert.equal(normalizeTemplateSliceFilePrefix(" bad/name:* "), "bad_name");
    assert.equal(normalizeTemplateSliceFilePrefix(""), "slice");
  });

  test("does not select the first template when the current selection is auto", () => {
    assert.equal(resolveTemplateSliceSelectedTemplateId({
      fileId: "file-a",
      templateState: createTemplateState({
        selectedTemplateId: null,
      }),
      templates: [
        createTemplate({ id: "template-a", name: "Template A" }),
      ],
    }), "");
  });

  test("uses the file template selection before the global template selection", () => {
    assert.equal(resolveTemplateSliceSelectedTemplateId({
      fileTemplateSelectionsByFileId: {
        "file-a": createTemplateSelection("template-file"),
      },
      fileId: "file-a",
      templateState: createTemplateState({
        selectedTemplateId: "template-global",
      }),
      templates: [
        createTemplate({ id: "template-global", name: "Global" }),
        createTemplate({ id: "template-file", name: "File" }),
      ],
    }), "template-file");
  });

  test("preserves an explicit modal template selection while templates refresh", () => {
    assert.equal(resolveTemplateSliceSelectedTemplateId({
      currentTemplateId: "template-b",
      fileId: "file-a",
      preserveCurrentTemplate: true,
      templateState: createTemplateState({
        selectedTemplateId: null,
      }),
      templates: [
        createTemplate({ id: "template-a", name: "Template A" }),
        createTemplate({ id: "template-b", name: "Template B" }),
      ],
    }), "template-b");
  });

  test("projects current selected template form state into slice templates", () => {
    const templates = resolveTemplateSliceTemplatesForState({
      templateState: createTemplateState({
        formState: createEmptyTemplateApplyConfig({
          name: "Template A",
          xRanges: [
            { start: "D2", end: "D3" },
            { start: "H2", end: "H3" },
          ],
          yColumns: [4, 8],
        }),
        selectedTemplateId: "template-a",
      }),
      templates: [
        createTemplate({
          id: "template-a",
          name: "Template A",
          xDataEnd: "A3",
          xDataStart: "A2",
          yColumns: [1],
        }),
      ],
    });

    const projectedTemplate = templates[0];
    assert.deepEqual(projectedTemplate?.xRanges, [
      { start: "D2", end: "D3" },
      { start: "H2", end: "H3" },
    ]);
    assert.deepEqual(projectedTemplate?.yColumns, [4, 8]);
  });
});

function createTemplate(overrides: Partial<TemplateApplyPresetRecord>): TemplateApplyPresetRecord {
  return {
    id: "template-1",
    name: "Template",
    xColumns: [0],
    yColumns: [1],
    ...overrides,
  };
}

function createTemplateState(overrides: Partial<TemplateState> = {}): TemplateState {
  return {
    mode: "management",
    selectedTemplateId: null,
    formState: createEmptyTemplateApplyConfig(),
    ...overrides,
  };
}
