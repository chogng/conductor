/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { prepareExtraction } from "src/cs/workbench/services/template/common/extractionValidation";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/common/extractionValidation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("points mode rejects non-integer point count cells", () => {
    const result = prepareExtraction({
      rawData: [{}],
      previewFile: { rowCount: 9 },
      getPreviewRow: (rowIndex) => rowIndex === 0 ? ["", "", "4.5"] : [],
      config: {
        bottomTitle: "",
        legendPrefix: "",
        xDataEnd: "A9",
        xDataStart: "A2",
        xPointsPerGroup: "C1",
        xSegmentCount: "",
        xSegmentationMode: "points",
        xUnit: "V",
        yColumns: [1],
        yUnit: "A",
      },
    });

    if (result.ok) {
      assert.fail("Expected extraction to fail.");
    }
    assert.match(result.message, /template\.extraction\.pointsCellPositiveInt/);
  });

  test("segments mode accepts a segment count cell", () => {
    const result = prepareExtraction({
      rawData: [{}],
      previewFile: { rowCount: 9 },
      getPreviewRow: (rowIndex) => rowIndex === 0 ? ["", "", "4"] : [],
      config: {
        bottomTitle: "",
        legendPrefix: "",
        xDataEnd: "A9",
        xDataStart: "A2",
        xPointsPerGroup: "",
        xSegmentCount: "C1",
        xSegmentationMode: "segments",
        xUnit: "V",
        yColumns: [1],
        yUnit: "A",
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      assert.fail(result.message);
    }

    const extractionConfig = result.extractionConfig as Record<string, unknown>;
    assert.deepEqual(extractionConfig.segmentCountCell, {
      rowIndex: 0,
      colIndex: 2,
    });
    assert.equal(extractionConfig.segmentCount, null);
    assert.equal(result.meta.segmentCountCell, true);
    assert.equal(result.meta.segmentCountPreview, 4);
  });

  test("segments mode rejects non-integer segment count cells", () => {
    const result = prepareExtraction({
      rawData: [{}],
      previewFile: { rowCount: 9 },
      getPreviewRow: (rowIndex) => rowIndex === 0 ? ["", "", "4.5"] : [],
      config: {
        bottomTitle: "",
        legendPrefix: "",
        xDataEnd: "A9",
        xDataStart: "A2",
        xPointsPerGroup: "",
        xSegmentCount: "C1",
        xSegmentationMode: "segments",
        xUnit: "V",
        yColumns: [1],
        yUnit: "A",
      },
    });

    if (result.ok) {
      assert.fail("Expected extraction to fail.");
    }
    assert.match(result.message, /extractSegmentsCellPositiveInt/);
  });

  test("multiple X columns resolve X and Y columns by index", () => {
    const result = prepareExtraction({
      rawData: [{}],
      previewFile: { rowCount: 9 },
      getPreviewRow: () => [],
      config: {
        bottomTitle: "",
        legendPrefix: "",
        xColumns: [3, 5, 7],
        xDataEnd: "D9",
        xDataStart: "D2",
        xPointsPerGroup: "",
        xSegmentCount: "",
        xSegmentationMode: "auto",
        xUnit: "V",
        yColumns: [4, 6, 8],
        yUnit: "A",
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      assert.fail(result.message);
    }

    const extractionConfig = result.extractionConfig as Record<string, unknown>;
    assert.deepEqual(extractionConfig.seriesBindings, [
      { xCol: 3, yCol: 4, xRange: undefined, yRange: undefined, groupKey: undefined },
      { xCol: 5, yCol: 6, xRange: undefined, yRange: undefined, groupKey: undefined },
      { xCol: 7, yCol: 8, xRange: undefined, yRange: undefined, groupKey: undefined },
    ]);
    assert.deepEqual(extractionConfig.xCols, [3, 5, 7]);
    assert.deepEqual(extractionConfig.yCols, [4, 6, 8]);
  });

  test("multiple X columns reject mismatched X and Y counts", () => {
    const result = prepareExtraction({
      rawData: [{}],
      previewFile: { rowCount: 9 },
      getPreviewRow: () => [],
      config: {
        bottomTitle: "",
        legendPrefix: "",
        xColumns: [3, 5, 7],
        xDataEnd: "D9",
        xDataStart: "D2",
        xPointsPerGroup: "",
        xSegmentCount: "",
        xSegmentationMode: "auto",
        xUnit: "V",
        yColumns: [4, 6],
        yUnit: "A",
      },
    });

    if (result.ok) {
      assert.fail("Expected extraction to fail.");
    }
    assert.match(result.message, /^template\.validation\.xyColumnCountMismatch/);
  });
});
