/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createTemplateSlicePlan,
  normalizeTemplateSliceFilePrefix,
} from "src/cs/workbench/contrib/files/browser/sliceWithTemplate";
import {
  resolveTemplateSliceSelectedTemplateId,
} from "src/cs/workbench/contrib/files/browser/sliceWithTemplateController";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { TemplateRecord, TemplateState } from "src/cs/workbench/services/template/common/template";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
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
      fileId: "file-a",
      templateState: createTemplateState({
        selectedTemplateId: "template-global",
        selectionsByFileId: {
          "file-a": createTemplateSelection("template-file"),
        },
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
});

function createTemplate(overrides: Partial<TemplateRecord>): TemplateRecord {
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
    formState: createEmptyTemplateConfig(),
    selectionsByFileId: {},
    templateListVersion: 0,
    ...overrides,
  };
}
