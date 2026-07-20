/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  ExportViewPane,
  type ExportViewOptions,
} from "src/cs/workbench/contrib/export/browser/exportViewPane";
import type {
  ExportState,
  ExportViewState,
  IExportService,
} from "src/cs/workbench/services/export/common/export";

suite("base/browser/workbench/exportViewPane", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("keeps an open export SelectBox mounted across view-state updates", () => {
    const pane = new ExportViewPane(createExportService());
    document.body.append(pane.element);
    pane.render(createExportViewOptions());

    const select = pane.element.querySelector<HTMLButtonElement>(
      "#analysis-origin-canvas-scope-select",
    );
    assert.ok(select);
    select.click();
    assert.equal(select.getAttribute("aria-expanded"), "true");

    const popup = document.body.querySelector<HTMLElement>(
      ".context-view.ui-selectbox__dropdown[aria-hidden='false']",
    );
    assert.ok(popup);

    try {
      pane.render(createExportViewOptions({
        curveOptions: [{
          key: "series-a",
          label: "Series A",
          sourceFileId: "file-a",
          sourceSeriesId: "series-a",
        }],
      }));

      assert.equal(
        pane.element.querySelector("#analysis-origin-canvas-scope-select"),
        select,
      );
      assert.equal(select.getAttribute("aria-expanded"), "true");
      assert.equal(popup.isConnected, true);
      assert.equal(popup.getAttribute("aria-hidden"), "false");
    } finally {
      pane.dispose();
    }
  });
});

const createExportService = (): IExportService => {
  const state: ExportState = {
    canvasScope: "current",
    curveMode: "all",
    filteredKind: "output",
    originMode: "merged",
    selectedContentKeys: ["iv"],
    selectedCurveKeys: [],
  };
  const viewState: ExportViewState = {
    curveOptions: [],
    hasMixedExportYScales: false,
    scopedFileIds: [],
    showFilteredCanvasKindSelect: false,
  };
  return {
    getState: () => state,
    getViewState: () => viewState,
    onDidChangeExportState: Event.None,
    onDidChangeExportViewState: Event.None,
    exportOriginZip: async () => undefined,
    openInOrigin: async () => undefined,
    setCanvasScope: () => undefined,
    setContentKeys: () => undefined,
    setCurveMode: () => undefined,
    setFilteredKind: () => undefined,
    setOriginMode: () => undefined,
    setSelectedCurveKeys: () => undefined,
  } as unknown as IExportService;
};

const createExportViewOptions = (
  overrides: Partial<ExportViewOptions> = {},
): ExportViewOptions => ({
  curveOptions: [],
  hasMixedExportYScales: false,
  mode: "merged",
  onExportOriginZip: async () => undefined,
  onModeChange: () => undefined,
  onOpenInOrigin: async () => undefined,
  onSelectedCurveOptionKeysChange: () => undefined,
  originCanvasExportScope: "current",
  originExportContentOptions: [
    { group: "basic", key: "iv", label: "IV" },
  ],
  originFilteredCanvasKind: "output",
  resolvedCurveExportMode: "all",
  selectedContentKeys: ["iv"],
  selectedCurveOptionKeySet: new Set(),
  setContentKeys: () => undefined,
  setOriginCanvasExportScope: () => undefined,
  setOriginFilteredCanvasKind: () => undefined,
  setResolvedCurveExportMode: () => undefined,
  showFilteredCanvasKindSelect: false,
  ...overrides,
});
