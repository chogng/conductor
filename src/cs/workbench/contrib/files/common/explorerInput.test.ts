import assert from "assert";

import { createChartExplorerFiles } from "./explorerInput.ts";

suite("workbench/contrib/files/common/explorerInput", () => {
  test("createChartExplorerFiles projects processed files with source paths", () => {
    const files = createChartExplorerFiles(
      [
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: "raw-key",
          relativePath: "batch/raw.csv",
          sourceKey: "source-key",
          sourcePath: "C:/data/raw.csv",
          curveType: "unknown",
          curveTypeConfidence: "low",
        },
      ],
      [
        {
          fileId: "raw-1",
          fileName: "processed.csv",
          curveType: "iv",
          curveTypeConfidence: "high",
        },
      ],
    );

    assert.deepEqual(files, [
      {
        file: undefined,
        fileId: "raw-1",
        fileName: "processed.csv",
        itemKey: "raw-key",
        normalizedCsvPath: undefined,
        relativePath: "batch/raw.csv",
        sourceKey: "source-key",
        sourcePath: "C:/data/raw.csv",
        curveType: "iv",
        curveTypeConfidence: "high",
        curveTypeNeedsTemplate: undefined,
        curveTypeReasons: undefined,
      },
    ]);
  });

  test("createChartExplorerFiles only includes cleaned entries with ids", () => {
    assert.deepEqual(
      createChartExplorerFiles(
        [{ fileId: "raw-only", fileName: "raw.csv" }],
        [{ fileName: "missing-id.csv" }],
      ),
      [],
    );
  });
});
