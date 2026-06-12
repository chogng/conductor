/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { prepareExtraction } from "src/cs/workbench/services/template/common/extractionValidation";

suite("workbench/services/template/common/extractionValidation", () => {
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
});
