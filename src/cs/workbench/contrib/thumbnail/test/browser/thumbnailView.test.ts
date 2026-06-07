import assert from "assert";

import {
  createThumbnailFieldFilterOptions,
  filterThumbnailFiles,
  getVisibleThumbnailFileIds,
  resolveThumbnailCurveFieldFilterMeta,
  type ThumbnailFileForView,
} from "src/cs/workbench/contrib/thumbnail/browser/thumbnailFilters";

suite("Thumbnail view", () => {
  test("resolveThumbnailCurveFieldFilterMeta prefers stable keys", () => {
    assert.deepEqual(
      resolveThumbnailCurveFieldFilterMeta({
        curveFilterField: "Batch A",
        curveFilterKey: "batch:a",
      }),
      {
        key: "batch:a",
        label: "Batch A",
      },
    );
    assert.deepEqual(
      resolveThumbnailCurveFieldFilterMeta({
        curveFilterField: "Batch B",
      }),
      {
        key: "field-label:batch b",
        label: "Batch B",
      },
    );
  });

  test("createThumbnailFieldFilterOptions deduplicates field filters", () => {
    assert.deepEqual(
      createThumbnailFieldFilterOptions(
        [
          { curveFilterField: "Batch A", curveFilterKey: "batch:a" },
          { curveFilterField: "Batch A", curveFilterKey: "batch:a" },
          { curveFilterField: "Batch B", curveFilterKey: "batch:b" },
        ],
      ),
      [
        { label: "match_mode_field: Batch A", value: "batch:a" },
        { label: "match_mode_field: Batch B", value: "batch:b" },
      ],
    );
  });

  test("filterThumbnailFiles handles built-in and field filters", () => {
    const files: ThumbnailFileForView[] = [
      { curveFilterKey: "batch:a", fileId: "a", xAxisRole: "vg" },
      { curveFilterKey: "batch:b", curveType: "output", fileId: "b" },
      { fileId: "c", xLabel: "Vd" },
    ];

    assert.deepEqual(getVisibleThumbnailFileIds(filterThumbnailFiles(files, "transfer")), ["a"]);
    assert.deepEqual(getVisibleThumbnailFileIds(filterThumbnailFiles(files, "output")), ["b", "c"]);
    assert.deepEqual(getVisibleThumbnailFileIds(filterThumbnailFiles(files, "batch:b")), ["b"]);
  });
});
