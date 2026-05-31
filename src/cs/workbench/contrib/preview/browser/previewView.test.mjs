import test from "node:test";
import assert from "node:assert/strict";

import {
  createPreviewFieldFilterOptions,
  filterPreviewFiles,
  getVisiblePreviewFileIds,
  resolvePreviewCurveFieldFilterMeta,
} from "./previewView.ts";
import {
  createPreviewSelectionEvent,
  createPreviewVisibleFilesEvent,
} from "./previewViewPane.ts";

const t = (key) => key;

test("resolvePreviewCurveFieldFilterMeta prefers stable keys", () => {
  assert.deepEqual(
    resolvePreviewCurveFieldFilterMeta({
      curveFilterField: "Batch A",
      curveFilterKey: "batch:a",
    }),
    {
      key: "batch:a",
      label: "Batch A",
    },
  );
  assert.deepEqual(
    resolvePreviewCurveFieldFilterMeta({
      curveFilterField: "Batch B",
    }),
    {
      key: "field-label:batch b",
      label: "Batch B",
    },
  );
});

test("createPreviewFieldFilterOptions deduplicates field filters", () => {
  assert.deepEqual(
    createPreviewFieldFilterOptions(
      [
        { curveFilterField: "Batch A", curveFilterKey: "batch:a" },
        { curveFilterField: "Batch A", curveFilterKey: "batch:a" },
        { curveFilterField: "Batch B", curveFilterKey: "batch:b" },
      ],
      t,
    ),
    [
      { label: "da_match_mode_field: Batch A", value: "batch:a" },
      { label: "da_match_mode_field: Batch B", value: "batch:b" },
    ],
  );
});

test("filterPreviewFiles handles built-in and field filters", () => {
  const files = [
    { curveFilterKey: "batch:a", fileId: "a", xAxisRole: "vg" },
    { curveFilterKey: "batch:b", curveType: "output", fileId: "b" },
    { fileId: "c", xLabel: "Vd" },
  ];

  assert.deepEqual(getVisiblePreviewFileIds(filterPreviewFiles(files, "transfer")), ["a"]);
  assert.deepEqual(getVisiblePreviewFileIds(filterPreviewFiles(files, "output")), ["b", "c"]);
  assert.deepEqual(getVisiblePreviewFileIds(filterPreviewFiles(files, "batch:b")), ["b"]);
});

test("preview pane events normalize ids", () => {
  assert.deepEqual(createPreviewSelectionEvent(" file-a "), { fileId: "file-a" });
  assert.equal(createPreviewSelectionEvent(""), null);
  assert.deepEqual(createPreviewVisibleFilesEvent([" a ", "", null, "b"]), {
    fileIds: ["a", "b"],
  });
});
