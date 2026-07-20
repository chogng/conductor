/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import type {
  IManagedHover,
  IManagedHoverContent,
  IManagedHoverContentOrFactory,
  IManagedHoverOptions,
} from "src/cs/base/browser/ui/hover/hover";
import {
  getBaseLayerHoverDelegate,
  setBaseLayerHoverDelegate,
  type IHoverDelegate,
} from "src/cs/base/browser/ui/hover/hoverDelegate";
import { VirtualTableGridModel } from "src/cs/base/browser/ui/table/virtualTable";
import {
  TableWidget,
  type TableWidgetModel,
  type TableWidgetProps,
  type TableWidgetSelection,
  type TableWidgetSelectionTarget,
  type TableWidgetState,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import {
  DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
  INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
  RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID,
} from "src/cs/workbench/contrib/table/browser/tableCommands";
import {
  getCanAdjustColumnScale,
  getTableColumnHeaderSelection,
} from "src/cs/workbench/contrib/table/browser/tableViewPane";
import { toScaleHeaderSuffix } from "src/cs/workbench/services/table/common/numericFormat";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import { TableColumnLayout } from "src/cs/workbench/services/table/common/tableColumnLayout";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

import "src/cs/workbench/contrib/table/browser/media/tableView.css";

type TableWidgetRowsVersionChangeEvent = Parameters<
  Parameters<TableWidgetModel["subscribeRowsVersion"]>[0]
>[0];

suite("base/browser/workbench tableWidget layout", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps template modes to table header interaction policy", () => {
    assert.equal(getTableColumnHeaderSelection("management"), "single");
    assert.equal(getCanAdjustColumnScale("management"), true);
    assert.equal(getTableColumnHeaderSelection("editor"), "multi");
    assert.equal(getCanAdjustColumnScale("editor"), false);
  });

  test("shows the first column scale as unavailable when it has no numeric display profile", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      const control = getVisibleColumnScaleControl(widget.element);
      assert.equal(control.dataset.colIndex, "0");
      assert.equal(getVisibleColumnScaleControlButton(widget.element, "value").textContent, "0");
      assert.equal(getVisibleColumnScaleControlButton(widget.element, "minus").disabled, true);
      assert.equal(getVisibleColumnScaleControlButton(widget.element, "plus").disabled, true);
    } finally {
      widget.dispose();
    }
  });

  test("rerenders visible cells when layout changes the viewport width", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 180, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleCellText(widget.element, 0, 4), undefined);

      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleCellText(widget.element, 0, 4), "E1");
    } finally {
      widget.dispose();
    }
  });

  test("fills wide viewports with bounded virtual empty columns", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(() => ({}), {
        getRow: rowIndex => [
          `A${rowIndex + 1}`,
          `B${rowIndex + 1}`,
          `C${rowIndex + 1}`,
        ],
      }),
      tableState: createTableWidgetState({ columnCount: 3 }),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 800, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleCellText(widget.element, 0, 2), "C1");
      assert.equal(getVisibleCellText(widget.element, 0, 3), "");
      assert.equal(getVisibleColumnHeaderText(widget.element, 3), "D");
    } finally {
      widget.dispose();
    }
  });

  test("keeps rendered table DOM while selected source is loading", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const headerButton = getColumnHeaderButton(widget.element, 0);
      const bodyCell = getVisibleCell(widget.element, 0, 0);
      const content = bodyCell.querySelector<HTMLElement>(".table_view_cell_content");
      assert.ok(content);
      assert.equal(bodyCell.textContent, "A1");

      const mutations: MutationRecord[] = [];
      const observer = new MutationObserver(records => {
        mutations.push(...records);
      });
      observer.observe(widget.element, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });

      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: createTableWidgetModel(),
        tableState: createTableWidgetState({
          file: null,
          sourceId: "file-b",
        }),
      });

      assert.equal(headerButton.isConnected, true);
      assert.equal(bodyCell.isConnected, true);
      assert.equal(bodyCell.querySelector<HTMLElement>(".table_view_cell_content"), content);
      assert.equal(bodyCell.textContent, "A1");
      assert.equal(widget.element.querySelector(".table_view_empty"), null);

      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: createTableWidgetModel(),
        tableState: createTableWidgetState({
          file: null,
          loadState: {
            message: "Loading preview...",
            state: "loading",
          },
          sourceId: "file-b",
        }),
      });

      assert.equal(headerButton.isConnected, true);
      assert.equal(bodyCell.isConnected, true);
      assert.equal(bodyCell.querySelector<HTMLElement>(".table_view_cell_content"), content);
      assert.equal(bodyCell.textContent, "A1");
      assert.equal(widget.element.querySelector(".table_view_empty"), null);

      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: createTableWidgetModel(() => ({}), {
          getRow: rowIndex => [
            `next-A${rowIndex + 1}`,
            `next-B${rowIndex + 1}`,
          ],
        }),
        tableState: createTableWidgetState({
          sourceId: "file-b",
        }),
      });

      await timeout(0);
      observer.disconnect();

      assert.equal(getColumnHeaderButton(widget.element, 0), headerButton);
      assert.equal(getVisibleCell(widget.element, 0, 0), bodyCell);
      assert.equal(bodyCell.querySelector<HTMLElement>(".table_view_cell_content"), content);
      assert.equal(bodyCell.textContent, "next-A1");
      assert.deepEqual(
        mutations
          .filter(mutation => !isBodyCellContentMutation(mutation))
          .map(mutation => ({
            attributeName: mutation.attributeName,
            target: getMutationTargetClassName(mutation),
            type: mutation.type,
          })),
        [],
      );
    } finally {
      widget.dispose();
    }
  });

  test("keeps rendered table shell while loading before visible ranges are cached", () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const content = widget.element.querySelector<HTMLElement>(".table_view_content");
      assert.ok(content);

      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: createTableWidgetModel(),
        tableState: createTableWidgetState({
          file: null,
          loadState: {
            message: "Loading preview...",
            state: "loading",
          },
          sourceId: "file-b",
        }),
      });

      assert.equal(widget.element.querySelector(".table_view_content"), content);
      assert.equal(content.isConnected, true);
      assert.equal(widget.element.querySelector(".table_view_empty"), null);
    } finally {
      widget.dispose();
    }
  });

  test("keeps rendered table DOM when loading source emits a full rows reset", async () => {
    const dynamicModel = createContentDirtyTableWidgetModel();
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: dynamicModel.model,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const bodyCell = getVisibleCell(widget.element, 0, 0);
      const content = bodyCell.querySelector<HTMLElement>(".table_view_cell_content");
      assert.ok(content);
      assert.equal(content.textContent, "A1");

      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: dynamicModel.model,
        tableState: createTableWidgetState({
          file: null,
          loadState: {
            message: "Loading preview...",
            state: "loading",
          },
          sourceId: "file-b",
        }),
      });
      dynamicModel.fireRowsVersion({
        full: true,
        kind: "reset",
        ranges: [],
      });

      await timeout(0);

      assert.equal(widget.element.querySelector(".table_view_empty"), null);
      assert.equal(getVisibleCell(widget.element, 0, 0), bodyCell);
      assert.equal(bodyCell.querySelector<HTMLElement>(".table_view_cell_content"), content);
      assert.equal(content.textContent, "A1");
    } finally {
      widget.dispose();
    }
  });

  test("switches ready sources by patching body content without mutating body cells", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const bodyCell = getVisibleCell(widget.element, 0, 0);
      const content = bodyCell.querySelector<HTMLElement>(".table_view_cell_content");
      assert.ok(content);
      assert.equal(content.textContent, "A1");

      const mutations: MutationRecord[] = [];
      const observer = new MutationObserver(records => {
        mutations.push(...records);
      });
      observer.observe(widget.element, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });

      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: createTableWidgetModel(() => ({}), {
          getRow: rowIndex => [
            `next-A${rowIndex + 1}`,
            `next-B${rowIndex + 1}`,
          ],
        }),
        tableState: createTableWidgetState({
          sourceId: "file-b",
        }),
      });

      await timeout(0);
      observer.disconnect();

      assert.equal(getVisibleCell(widget.element, 0, 0), bodyCell);
      assert.equal(bodyCell.querySelector<HTMLElement>(".table_view_cell_content"), content);
      assert.equal(content.textContent, "next-A1");
      assert.ok(mutations.length > 0);
      assert.deepEqual(
        mutations
          .filter(mutation => !isBodyCellContentMutation(mutation))
          .map(mutation => ({
            attributeName: mutation.attributeName,
            target: getMutationTargetClassName(mutation),
            type: mutation.type,
          })),
        [],
      );
    } finally {
      widget.dispose();
    }
  });

  test("exposes rendered size and base zoom state", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);
    const sizeEvents: unknown[] = [];
    const sizeListener = widget.onDidChangeSize(value => {
      sizeEvents.push(value);
    });
    const zoomEvents: number[] = [];
    const zoomListener = widget.onDidChangeZoom(value => {
      zoomEvents.push(value);
    });

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      assert.deepEqual(widget.getSize(), { columnCount: 10, rowCount: 20 });
      assert.deepEqual(sizeEvents, []);
      widget.update({
        columnSizingMode: "fixed",
        onSelect: () => true,
        tableViewModel: createTableWidgetModel(),
        tableState: createTableWidgetState({ columnCount: 4 }),
      });
      assert.deepEqual(widget.getSize(), { columnCount: 4, rowCount: 20 });
      assert.deepEqual(sizeEvents, [{ columnCount: 4, rowCount: 20 }]);
      assert.equal(widget.getZoomPercent(), 100);
      assert.equal(widget.zoomIn(), true);
      assert.equal(widget.getZoomPercent(), 110);
      assert.equal(
        widget.element.querySelector<HTMLElement>(".table_view_body")?.style.getPropertyValue("--table-view-zoom"),
        "1.1",
      );
      assert.equal(getVisibleCellText(widget.element, 0, 0), "A1");

      assert.equal(widget.resetZoom(), true);
      assert.equal(widget.getZoomPercent(), 100);
      assert.deepEqual(zoomEvents, [110, 100]);
    } finally {
      sizeListener.dispose();
      zoomListener.dispose();
      widget.dispose();
    }
  });

  test("resizes columns through the base table resize event", async () => {
    const storedWidths: unknown[] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      storeColumnWidths: (_source, widths) => {
        storedWidths.push(widths);
      },
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const body = widget.element.querySelector<HTMLElement>(".table_view_body");
      assert.ok(body);
      body.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
      const handle = getColumnResizeHandle(widget.element, 0);
      const targetWindow = widget.element.ownerDocument.defaultView;
      assert.ok(targetWindow);
      const startClientX =
        VirtualTableGridModel.getRowHeaderWidth(widget.getZoomPercent()) +
        TableColumnLayout.defaultWidth;
      const clientY = VirtualTableGridModel.getRowHeight(widget.getZoomPercent()) / 2;

      dispatchPointerEvent(handle, "pointerdown", {
        buttons: 1,
        clientX: startClientX,
        clientY,
        pointerId: 9,
      });
      assert.equal(widget.element.classList.contains("table_view--resizing_column"), true);

      targetWindow.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        cancelable: true,
        clientX: startClientX + 40,
        clientY,
        pointerId: 9,
        pointerType: "mouse",
      }));

      targetWindow.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: startClientX + 40,
        clientY,
        pointerId: 9,
        pointerType: "mouse",
      }));
      assert.equal(widget.element.classList.contains("table_view--resizing_column"), false);
      await timeout(160);

      assert.deepEqual(storedWidths.at(-1), [{
        colIndex: 0,
        width: TableColumnLayout.defaultWidth + 40,
      }]);
    } finally {
      widget.dispose();
    }
  });

  test("auto-fits column widths from table content length summaries", async () => {
    const widget = new TableWidget({
      columnSizingMode: "autoFit",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState({
        columnCount: 3,
        maxCellLengths: [1, 20, 200],
      }),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 900, 280);
      widget.layout();
      await timeout(120);

      const shortWidth = getColumnHeaderWidth(widget.element, 0);
      const mediumWidth = getColumnHeaderWidth(widget.element, 1);
      const longWidth = getColumnHeaderWidth(widget.element, 2);

      assert.equal(shortWidth, TableColumnLayout.autoFitMinWidth);
      assert.ok(mediumWidth > TableColumnLayout.defaultWidth);
      assert.ok(mediumWidth < TableColumnLayout.maxWidth);
      assert.equal(longWidth, TableColumnLayout.maxWidth);
    } finally {
      widget.dispose();
    }
  });

  test("does not start manual column resize while auto-fit is enabled", async () => {
    const storedWidths: unknown[] = [];
    const widget = new TableWidget({
      columnSizingMode: "autoFit",
      onSelect: () => true,
      storeColumnWidths: (_source, widths) => {
        storedWidths.push(widths);
      },
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState({
        maxCellLengths: [12, 2],
      }),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const body = widget.element.querySelector<HTMLElement>(".table_view_body");
      assert.ok(body);
      body.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
      const handle = getColumnResizeHandle(widget.element, 0);
      const targetWindow = widget.element.ownerDocument.defaultView;
      assert.ok(targetWindow);
      const startClientX =
        VirtualTableGridModel.getRowHeaderWidth(widget.getZoomPercent()) +
        getColumnHeaderWidth(widget.element, 0);
      const clientY = VirtualTableGridModel.getRowHeight(widget.getZoomPercent()) / 2;

      dispatchPointerEvent(handle, "pointerdown", {
        buttons: 1,
        clientX: startClientX,
        clientY,
        pointerId: 10,
      });
      assert.equal(widget.element.classList.contains("table_view--resizing_column"), false);

      targetWindow.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        buttons: 1,
        cancelable: true,
        clientX: startClientX + 40,
        clientY,
        pointerId: 10,
        pointerType: "mouse",
      }));
      targetWindow.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        buttons: 0,
        cancelable: true,
        clientX: startClientX + 40,
        clientY,
        pointerId: 10,
        pointerType: "mouse",
      }));
      await timeout(160);

      assert.deepEqual(storedWidths, []);
    } finally {
      widget.dispose();
    }
  });

  test("auto-fits one fixed column from a resize boundary double click", async () => {
    const storedWidths: unknown[] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      storeColumnWidths: (_source, widths) => {
        storedWidths.push(widths);
      },
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState({
        maxCellLengths: [20, 2],
      }),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const body = widget.element.querySelector<HTMLElement>(".table_view_body");
      assert.ok(body);
      body.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
      const startClientX =
        VirtualTableGridModel.getRowHeaderWidth(widget.getZoomPercent()) +
        TableColumnLayout.defaultWidth;

      dispatchMouseEvent(getColumnResizeHandle(widget.element, 0), "dblclick", {
        clientX: startClientX,
        clientY: VirtualTableGridModel.getRowHeight(widget.getZoomPercent()) / 2,
      });
      await timeout(160);

      const autoFitWidth = getColumnHeaderWidth(widget.element, 0);
      assert.ok(autoFitWidth > TableColumnLayout.defaultWidth);
      assert.ok(autoFitWidth < TableColumnLayout.maxWidth);
      assert.deepEqual(storedWidths.at(-1), [{
        colIndex: 0,
        width: autoFitWidth,
      }]);
    } finally {
      widget.dispose();
    }
  });

  test("ignores resize boundary double click while auto-fit mode is active", async () => {
    const storedWidths: unknown[] = [];
    const widget = new TableWidget({
      columnSizingMode: "autoFit",
      onSelect: () => true,
      storeColumnWidths: (_source, widths) => {
        storedWidths.push(widths);
      },
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState({
        maxCellLengths: [20, 2],
      }),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const body = widget.element.querySelector<HTMLElement>(".table_view_body");
      assert.ok(body);
      body.getBoundingClientRect = () => new DOMRect(0, 0, 800, 320);
      const autoFitWidth = getColumnHeaderWidth(widget.element, 0);
      const startClientX =
        VirtualTableGridModel.getRowHeaderWidth(widget.getZoomPercent()) +
        autoFitWidth;

      dispatchMouseEvent(getColumnResizeHandle(widget.element, 0), "dblclick", {
        clientX: startClientX,
        clientY: VirtualTableGridModel.getRowHeight(widget.getZoomPercent()) / 2,
      });
      await timeout(160);

      assert.equal(getColumnHeaderWidth(widget.element, 0), autoFitWidth);
      assert.deepEqual(storedWidths, []);
    } finally {
      widget.dispose();
    }
  });

  test("renders scaled numeric cells from column display profiles", async () => {
    const hoverDelegate = new TestHoverDelegate();
    const previousHoverDelegate = getBaseLayerHoverDelegate();
    setBaseLayerHoverDelegate(hoverDelegate);
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createSmartTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      assert.equal(
        widget.element.querySelector<HTMLButtonElement>(".table_view_column_button")?.textContent,
        "A",
      );
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁹");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "-3.70327");
      assert.equal(
        getVisibleCellTitle(widget.element, 0, 0),
        undefined,
      );
      assert.equal(
        getHoverLineText(hoverDelegate.hovers[0]?.content),
        "-3.70327E-009",
      );
    } finally {
      setBaseLayerHoverDelegate(previousHoverDelegate);
      widget.dispose();
    }
  });

  test("keeps column scale badges out of header layout", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createSmartTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      const badge = getVisibleScaleBadge(widget.element);
      const style = badge.ownerDocument.defaultView?.getComputedStyle(badge);
      assert.equal(style?.position, "absolute");
      assert.equal(style?.right, "12px");
      assert.equal(style?.marginRight, "0px");
    } finally {
      widget.dispose();
    }
  });

  test("draws selected column borders inside table cells", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      widget.element.style.setProperty("--accent", "0 0 0");
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      const header = getColumnHeaderCell(widget.element, 0);
      header.classList.add("column-selected");
      assert.equal(header.ownerDocument.defaultView?.getComputedStyle(header).boxShadow === "none", false);
    } finally {
      widget.dispose();
    }
  });

  test("keeps header and first-row column boundaries aligned across zoom levels", async () => {
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    widget.element.style.width = "800px";
    widget.element.style.height = "400px";
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 800, 400);
      widget.layout();
      await timeout(120);

      const zoomChanges = [
        () => {
          for (let count = 0; count < 4; count += 1) {
            widget.zoomOut();
          }
        },
        () => widget.zoomIn(),
        () => widget.resetZoom(),
      ];
      for (const changeZoom of zoomChanges) {
        changeZoom();

        for (const colIndex of [0, 1, 2]) {
          const header = getColumnHeaderCell(widget.element, colIndex);
          const bodyCell = getVisibleCell(widget.element, 0, colIndex);
          assert.equal(header.closest("table"), bodyCell.closest("table"));
          assert.equal(header.getBoundingClientRect().left, bodyCell.getBoundingClientRect().left);
          assert.equal(header.getBoundingClientRect().right, bodyCell.getBoundingClientRect().right);
        }
      }
    } finally {
      widget.dispose();
    }
  });

  test("refreshes column scale headers when rows version changes", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: dynamicModel.model,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      assert.equal(
        widget.element.querySelector<HTMLButtonElement>(".table_view_column_button")?.textContent,
        "A",
      );
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1");

      dynamicModel.setScaleExponent(-9);
      dynamicModel.fireRowsVersion();

      assert.equal(
        widget.element.querySelector<HTMLButtonElement>(".table_view_column_button")?.textContent,
        "A",
      );
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁹");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1000");
    } finally {
      widget.dispose();
    }
  });

  test("patches visible display dirty cells from column scale changes", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: dynamicModel.model,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1");

      dynamicModel.setScaleExponent(-9);
      dynamicModel.fireRowsVersion({
        full: false,
        kind: "display",
        ranges: [{ startRow: 0, endRow: 20, startCol: 0, endCol: 1 }],
      });

      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁹");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1000");
    } finally {
      widget.dispose();
    }
  });

  test("patches only visible content dirty cells", async () => {
    const dynamicModel = createContentDirtyTableWidgetModel();
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: () => true,
      tableViewModel: dynamicModel.model,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleCellText(widget.element, 0, 0), "A1");
      assert.equal(getVisibleCellText(widget.element, 0, 1), "B1");

      dynamicModel.setCell(0, 0, "A1 outside");
      dynamicModel.setCell(0, 1, "B1 outside");
      dynamicModel.fireRowsVersion({
        full: false,
        kind: "content",
        ranges: [{ startRow: 10, endRow: 11 }],
      });

      assert.equal(getVisibleCellText(widget.element, 0, 0), "A1");
      assert.equal(getVisibleCellText(widget.element, 0, 1), "B1");

      dynamicModel.setCell(0, 0, "A1 patched");
      dynamicModel.setCell(0, 1, "B1 should-not-patch");
      dynamicModel.fireRowsVersion({
        full: false,
        kind: "content",
        ranges: [{ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }],
      });

      assert.equal(getVisibleCellText(widget.element, 0, 0), "A1 patched");
      assert.equal(getVisibleCellText(widget.element, 0, 1), "B1");
    } finally {
      widget.dispose();
    }
  });

  test("adjusts the first column scale from the bottom control by default", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    const commandCalls: string[] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      commandService: createColumnScaleCommandService(dynamicModel, commandCalls),
      onSelect: () => true,
      tableViewModel: dynamicModel.model,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1");

      const control = getVisibleColumnScaleControl(widget.element);
      const controlStyle = control.ownerDocument.defaultView?.getComputedStyle(control);
      assert.equal(controlStyle?.position, "absolute");
      assert.ok(controlStyle?.right && controlStyle.right !== "auto");
      assert.ok(controlStyle?.bottom && controlStyle.bottom !== "auto");
      assert.equal(controlStyle?.fontSize, "12px");
      assert.equal(controlStyle?.opacity, "1");
      assert.equal(
        control.ownerDocument.defaultView?.getComputedStyle(
          getVisibleColumnScaleControlButton(widget.element, "minus"),
        ).width,
        "24px",
      );
      assert.equal(getVisibleColumnScaleControlButton(widget.element, "value").textContent, "-6");
      getVisibleColumnScaleControlButton(widget.element, "plus").click();
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁵");
      assert.equal(getVisibleColumnScaleControlButton(widget.element, "value").textContent, "-5");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "0.1");

      getVisibleColumnScaleControlButton(widget.element, "minus").click();
      getVisibleColumnScaleControlButton(widget.element, "minus").click();
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁷");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "10");

      getVisibleColumnScaleControlButton(widget.element, "value").click();
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1");
      assert.deepEqual(commandCalls, [
        `${INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID}:0`,
        `${DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID}:0`,
        `${DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID}:0`,
        `${RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID}:0`,
      ]);
    } finally {
      widget.dispose();
    }
  });

  test("follows a single selected column and returns to the first column", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    let selection: TableWidgetSelection = {};
    const selectionListeners = new Set<(selection: TableWidgetSelection) => void>();
    const tableViewModel: TableWidgetModel = {
      ...dynamicModel.model,
      getSelection: () => selection,
      onDidChangeSelection: callback => {
        selectionListeners.add(callback);
        return () => {
          selectionListeners.delete(callback);
        };
      },
    };
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      columnHeaderSelection: "single",
      onSelect: target => {
        selection = applySelectionTarget(target);
        for (const callback of Array.from(selectionListeners)) {
          callback(selection);
        }
        return true;
      },
      tableViewModel,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const control = getVisibleColumnScaleControl(widget.element);
      assert.equal(control.dataset.colIndex, "0");

      getColumnHeaderButton(widget.element, 2).click();
      assert.equal(control.dataset.colIndex, "2");

      getColumnHeaderButton(widget.element, 2).click();
      assert.equal(control.dataset.colIndex, "0");
    } finally {
      widget.dispose();
    }
  });

  test("keeps column scale badges readonly and uses badge clicks for column selection", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    let selection: TableWidgetSelection = {};
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      canAdjustColumnScale: false,
      columnHeaderSelection: "multi",
      onSelect: target => {
        selection = applySelectionTarget(target);
        selectedColumns.push([...(selection.selectedColumns ?? [])]);
        return true;
      },
      tableViewModel: dynamicModel.model,
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 300, 280);
      widget.layout();
      await timeout(120);

      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      const badge = getVisibleScaleBadge(widget.element);
      assert.equal(badge.dataset.interactive, "false");
      assert.equal(badge.getAttribute("aria-disabled"), "true");

      clickElementCenter(badge);

      assert.equal(widget.element.querySelector(".table_view_column_scale_control:not([hidden])"), null);
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      assert.deepEqual(selectedColumns, [[0]]);
    } finally {
      widget.dispose();
    }
  });

  test("uses single-toggle selection for column header clicks by default", async () => {
    let selection: TableWidgetSelection = {};
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: target => {
        selection = applySelectionTarget(target);
        selectedColumns.push([...(selection.selectedColumns ?? [])]);
        return true;
      },
      tableViewModel: createTableWidgetModel(() => selection),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      getColumnHeaderButton(widget.element, 0).click();
      getColumnHeaderButton(widget.element, 1).click();
      getColumnHeaderButton(widget.element, 1).click();

      assert.deepEqual(selectedColumns, [[0], [1], []]);
    } finally {
      widget.dispose();
    }
  });

  test("does not treat column resize handle clicks as header selection", async () => {
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: target => {
        selectedColumns.push([...(target?.kind === "columns" ? target.columns : [])]);
        return true;
      },
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      getColumnResizeHandle(widget.element, 0).dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));

      assert.deepEqual(selectedColumns, []);
    } finally {
      widget.dispose();
    }
  });

  test("ignores column header selection when disabled", async () => {
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      columnHeaderSelection: "disabled",
      onSelect: target => {
        selectedColumns.push([...(target?.kind === "columns" ? target.columns : [])]);
        return true;
      },
      tableViewModel: createTableWidgetModel(),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      getColumnHeaderButton(widget.element, 0).click();
      getColumnHeaderButton(widget.element, 1).click();

      assert.deepEqual(selectedColumns, []);
    } finally {
      widget.dispose();
    }
  });

  test("keeps additive column header selection when multi mode is requested", async () => {
    let selection: TableWidgetSelection = {};
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      columnHeaderSelection: "multi",
      onSelect: target => {
        selection = applySelectionTarget(target);
        selectedColumns.push([...(selection.selectedColumns ?? [])]);
        return true;
      },
      tableViewModel: createTableWidgetModel(() => selection),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      getColumnHeaderButton(widget.element, 0).click();
      getColumnHeaderButton(widget.element, 1).click();
      getColumnHeaderButton(widget.element, 0).click();

      assert.deepEqual(selectedColumns, [[0], [0, 1], [1]]);
    } finally {
      widget.dispose();
    }
  });

  test("drags body cells into a table range without native text selection", async () => {
    let selection: TableWidgetSelection = {};
    const selectionListeners = new Set<(selection: TableWidgetSelection) => void>();
    const selectedTargets: (TableWidgetSelectionTarget | null)[] = [];
    const widget = new TableWidget({
      columnSizingMode: "fixed",
      onSelect: target => {
        selectedTargets.push(target);
        selection = applySelectionTarget(target);
        for (const callback of Array.from(selectionListeners)) {
          callback(selection);
        }
        return true;
      },
      tableViewModel: createTableWidgetModel(() => selection, {
        onDidChangeSelection: callback => {
          selectionListeners.add(callback);
          return () => {
            selectionListeners.delete(callback);
          };
        },
      }),
      tableState: createTableWidgetState(),
    });
    document.body.append(widget.element);
    let nativeSelectionText: HTMLElement | null = null;

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const startCell = getVisibleCell(widget.element, 0, 0);
      const innerCell = getVisibleCell(widget.element, 1, 1);
      const endCell = getVisibleCell(widget.element, 2, 2);
      nativeSelectionText = document.createElement("span");
      nativeSelectionText.textContent = "native selection";
      document.body.append(nativeSelectionText);
      document.getSelection()?.selectAllChildren(nativeSelectionText);
      assert.ok((document.getSelection()?.toString() ?? "").length > 0);

      dispatchPointerEvent(startCell, "pointerdown", {
        buttons: 1,
        clientX: 10,
        clientY: 10,
        pointerId: 7,
      });
      dispatchPointerEvent(endCell, "pointermove", {
        buttons: 1,
        clientX: 20,
        clientY: 20,
        pointerId: 7,
      });
      dispatchPointerEvent(endCell, "pointerup", {
        buttons: 0,
        clientX: 20,
        clientY: 20,
        pointerId: 7,
      });

      assert.deepEqual(selectedTargets.map(target => target?.kind), ["cell", "range"]);
      assert.deepEqual(selection.activeCell, {
        colIndex: 2,
        rowIndex: 2,
        sheetId: null,
      });
      assert.deepEqual(selection.ranges, [{
        startRow: 0,
        endRow: 2,
        startCol: 0,
        endCol: 2,
        sheetId: null,
      }]);
      assert.equal(startCell.dataset.selectionFrame, "true");
      assert.equal(startCell.style.getPropertyValue("--table-view-selection-frame-top"), "2px");
      assert.equal(startCell.style.getPropertyValue("--table-view-selection-frame-left"), "2px");
      assert.equal(innerCell.dataset.selectionFrame, "false");
      assert.equal(endCell.dataset.active, "false");
      assert.equal(endCell.dataset.selectionFrame, "true");
      assert.equal(endCell.style.getPropertyValue("--table-view-selection-frame-right"), "2px");
      assert.equal(endCell.style.getPropertyValue("--table-view-selection-frame-bottom"), "2px");
      assert.equal(document.getSelection()?.toString(), "");
    } finally {
      nativeSelectionText?.remove();
      widget.dispose();
    }
  });
});

function createTableWidgetState(
  options: {
    readonly columnCount?: number;
    readonly file?: TableWidgetState["file"] | null;
    readonly loadState?: TableWidgetState["loadState"];
    readonly maxCellLengths?: readonly number[];
    readonly rowCount?: number;
    readonly sheetId?: string | null;
    readonly sourceId?: string;
  } = {},
): TableWidgetState {
  const sourceId = options.sourceId ?? "file-a";
  const sheetId = options.sheetId ?? null;
  const rowCount = options.rowCount ?? 20;
  const columnCount = options.columnCount ?? 10;
  const source: TableSource = {
    resource: URI.parse(`table-test:///${sourceId}`),
    sheetId,
  };
  const file = options.file === undefined
    ? {
        columnCount,
        fileName: "sample.csv",
        maxCellLengths: options.maxCellLengths ?? Array.from({ length: columnCount }, () => 2),
        rowCount,
        sheetId,
        source,
        sourceVersion: 1,
      }
    : options.file;
  return {
    dimensions: file ? `${rowCount} x ${columnCount}` : undefined,
    file,
    fileName: "sample.csv",
    loadState: options.loadState ?? {
      message: "",
      state: "ready",
    },
    selectedSheetId: sheetId,
    source,
  };
}

function createTableWidgetModel(
  getSelection: () => TableWidgetSelection = () => ({}),
  options: {
    readonly getRow?: (rowIndex: number) => unknown[] | null;
    readonly onDidChangeSelection?: TableWidgetModel["onDidChangeSelection"];
  } = {},
): TableWidgetModel {
  const getRow = options.getRow ?? (rowIndex => [
    `A${rowIndex + 1}`,
    `B${rowIndex + 1}`,
    `C${rowIndex + 1}`,
    `D${rowIndex + 1}`,
    `E${rowIndex + 1}`,
    `F${rowIndex + 1}`,
    `G${rowIndex + 1}`,
    `H${rowIndex + 1}`,
    `I${rowIndex + 1}`,
    `J${rowIndex + 1}`,
  ]);
  const getResolvedRow = (rowIndex: number): unknown[] => {
    const row = getRow(rowIndex);
    if (!row) {
      throw new RangeError(`Missing test row ${rowIndex}`);
    }
    return row;
  };
  return {
    get: getResolvedRow,
    getColumnDisplayProfile: colIndex => createRawColumnDisplayProfile(colIndex),
    getHighlight: () => ({}),
    getRangeDecorations: () => [],
    getRowsVersion: () => 1,
    getSelection,
    getState: createTableWidgetState,
    isResolved: rowIndex => getRow(rowIndex) !== null,
    onDidChangeHighlight: () => noopDisposable,
    onDidChangeRangeDecorations: () => noopDisposable,
    onDidChangeRevealCell: () => noopDisposable,
    onDidChangeSelection: options.onDidChangeSelection ?? (() => noopDisposable),
    onDidChangeState: () => noopDisposable,
    resolve: async rowIndex => getResolvedRow(rowIndex),
    subscribeRowsVersion: () => noopDisposable,
  };
}

function applySelectionTarget(
  target: TableWidgetSelectionTarget | null,
): TableWidgetSelection {
  if (!target) {
    return {};
  }

  if (target.kind === "columns") {
    return {
      selectedColumns: target.columns,
    };
  }

  if (target.kind === "cell") {
    return {
      activeCell: target.cell,
    };
  }

  return {
    activeCell: {
      colIndex: target.range.endCol,
      rowIndex: target.range.endRow,
      sheetId: target.range.sheetId ?? null,
    },
    ranges: [target.range],
  };
}

function createSmartTableWidgetModel(): TableWidgetModel {
  const profile: ColumnDisplayProfile = {
    columnId: "0",
    mode: "columnScale",
    isNumericColumn: true,
    scaleExponent: -9,
    headerSuffix: "×10⁻⁹",
    significantDigits: 6,
    sourceVersion: 1,
    settingsVersion: 1,
  };

  return {
    ...createTableWidgetModel(() => ({}), {
      getRow: () => [
        "-3.70327E-009",
        "B1",
        "C1",
        "D1",
        "E1",
        "F1",
        "G1",
        "H1",
        "I1",
        "J1",
      ],
    }),
    getColumnDisplayProfile: () => profile,
  };
}

function createContentDirtyTableWidgetModel(): {
  readonly model: TableWidgetModel;
  readonly fireRowsVersion: (change: Omit<TableWidgetRowsVersionChangeEvent, "version">) => void;
  readonly setCell: (rowIndex: number, colIndex: number, value: string) => void;
} {
  let rowsVersion = 1;
  const subscribers = new Set<(event: TableWidgetRowsVersionChangeEvent) => void>();
  const rows = Array.from({ length: 20 }, (_row, rowIndex) => [
    `A${rowIndex + 1}`,
    `B${rowIndex + 1}`,
    `C${rowIndex + 1}`,
    `D${rowIndex + 1}`,
    `E${rowIndex + 1}`,
    `F${rowIndex + 1}`,
    `G${rowIndex + 1}`,
    `H${rowIndex + 1}`,
    `I${rowIndex + 1}`,
    `J${rowIndex + 1}`,
  ]);

  return {
    fireRowsVersion: change => {
      rowsVersion += 1;
      const event: TableWidgetRowsVersionChangeEvent = {
        ...change,
        version: rowsVersion,
      };
      for (const callback of Array.from(subscribers)) {
        callback(event);
      }
    },
    model: {
      ...createTableWidgetModel(() => ({}), {
        getRow: rowIndex => rows[rowIndex] ?? [],
      }),
      getRowsVersion: () => rowsVersion,
      subscribeRowsVersion: callback => {
        subscribers.add(callback);
        return () => {
          subscribers.delete(callback);
        };
      },
    },
    setCell: (rowIndex, colIndex, value) => {
      rows[rowIndex][colIndex] = value;
    },
  };
}

function createDynamicScaleTableWidgetModel(): {
  readonly adjustColumnDisplayScale: (colIndex: number, deltaExponent: number) => boolean;
  readonly model: TableWidgetModel;
  readonly fireRowsVersion: (change?: Omit<TableWidgetRowsVersionChangeEvent, "version">) => void;
  readonly resetColumnDisplayScale: (colIndex: number) => boolean;
  readonly setScaleExponent: (scaleExponent: number) => void;
} {
  let rowsVersion = 1;
  let scaleExponent = -6;
  let isScaleManual = false;
  const subscribers = new Set<(event: TableWidgetRowsVersionChangeEvent) => void>();
  const fireRowsVersion = (
    change: Omit<TableWidgetRowsVersionChangeEvent, "version"> = {
      full: true,
      kind: "display",
      ranges: [],
    },
  ) => {
    rowsVersion += 1;
    const event: TableWidgetRowsVersionChangeEvent = {
      ...change,
      version: rowsVersion,
    };
    for (const callback of Array.from(subscribers)) {
      callback(event);
    }
  };

  return {
    adjustColumnDisplayScale: (_colIndex, deltaExponent) => {
      scaleExponent += Math.trunc(Number(deltaExponent) || 0);
      isScaleManual = true;
      fireRowsVersion();
      return true;
    },
    fireRowsVersion,
    model: {
      ...createTableWidgetModel(() => ({}), {
        getRow: () => [
          "1.00000E-006",
          "B1",
          "C1",
          "D1",
          "E1",
          "F1",
          "G1",
          "H1",
          "I1",
          "J1",
        ],
      }),
      getColumnDisplayProfile: () => createScaledColumnDisplayProfile(scaleExponent, isScaleManual),
      getRowsVersion: () => rowsVersion,
      subscribeRowsVersion: callback => {
        subscribers.add(callback);
        return () => {
          subscribers.delete(callback);
        };
      },
    },
    resetColumnDisplayScale: () => {
      scaleExponent = -6;
      isScaleManual = false;
      fireRowsVersion();
      return true;
    },
    setScaleExponent: nextScaleExponent => {
      scaleExponent = nextScaleExponent;
    },
  };
}

function createColumnScaleCommandService(
  dynamicModel: ReturnType<typeof createDynamicScaleTableWidgetModel>,
  calls: string[],
): NonNullable<TableWidgetProps["commandService"]> {
  return {
    executeCommand: async <R = unknown>(
      commandId: string,
      ...args: unknown[]
    ): Promise<R | undefined> => {
      const columnIndex = Math.floor(Number(args[0]));
      calls.push(`${commandId}:${columnIndex}`);
      const result = commandId === DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID
        ? dynamicModel.adjustColumnDisplayScale(columnIndex, -1)
        : commandId === INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID
          ? dynamicModel.adjustColumnDisplayScale(columnIndex, 1)
          : commandId === RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID
            ? dynamicModel.resetColumnDisplayScale(columnIndex)
            : false;
      return result as R;
    },
  };
}

function createScaledColumnDisplayProfile(scaleExponent: number, isScaleManual = false): ColumnDisplayProfile {
  return {
    columnId: "0",
    mode: "columnScale",
    isNumericColumn: true,
    isScaleManual: isScaleManual || undefined,
    scaleExponent,
    headerSuffix: toScaleHeaderSuffix(scaleExponent),
    significantDigits: 6,
    sourceVersion: 1,
    settingsVersion: 1,
  };
}

function getVisibleScaleText(element: HTMLElement): string | undefined {
  return element.querySelector<HTMLElement>(
    ".table_view_column_scale_badge:not([hidden])",
  )?.textContent ?? undefined;
}

function getVisibleScaleBadge(element: HTMLElement): HTMLButtonElement {
  const badge = element.querySelector<HTMLButtonElement>(".table_view_column_scale_badge:not([hidden])");
  assert.ok(badge);
  return badge;
}

function getVisibleColumnScaleControl(element: HTMLElement): HTMLElement {
  const control = element.querySelector<HTMLElement>(".table_view_column_scale_control:not([hidden])");
  assert.ok(control);
  return control;
}

function getVisibleColumnScaleControlButton(
  element: HTMLElement,
  kind: "minus" | "plus" | "value",
): HTMLButtonElement {
  const action = kind === "value"
    ? "reset"
    : kind === "plus"
      ? "increase"
      : "decrease";
  const selector = `.table_view_column_scale_control:not([hidden]) [data-scale-action="${action}"]`;
  const button = element.querySelector<HTMLButtonElement>(selector);
  assert.ok(button);
  return button;
}

function getColumnHeaderButton(element: HTMLElement, colIndex: number): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>(
    `.table_view_column_button[data-col-index="${colIndex}"]`,
  );
  assert.ok(button);
  return button;
}

function getColumnHeaderCell(element: HTMLElement, colIndex: number): HTMLElement {
  const cell = element.querySelector<HTMLElement>(
    `.table_view_grid_header_cell[aria-colindex="${colIndex + 1}"]`,
  );
  assert.ok(cell);
  return cell;
}

function getColumnHeaderWidth(element: HTMLElement, colIndex: number): number {
  const width = Number.parseFloat(getColumnHeaderCell(element, colIndex).style.width);
  assert.equal(Number.isFinite(width), true);
  return width;
}

function getColumnResizeHandle(element: HTMLElement, colIndex: number): HTMLElement {
  const handle = element.querySelector<HTMLElement>(
    `.table_view_grid_header_cell[aria-colindex="${colIndex + 1}"] .table_view_column_resize_handle`,
  );
  assert.ok(handle);
  return handle;
}

function createRawColumnDisplayProfile(colIndex: number): ColumnDisplayProfile {
  return {
    columnId: String(colIndex),
    mode: "raw",
    isNumericColumn: false,
    scaleExponent: 0,
    significantDigits: 6,
    sourceVersion: 0,
    settingsVersion: 0,
  };
}

function setElementClientSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: height,
  });
}

function isBodyCellContentMutation(mutation: MutationRecord): boolean {
  return Boolean(getMutationTargetElement(mutation)?.closest(".table_view_cell_content"));
}

function getMutationTargetClassName(mutation: MutationRecord): string {
  const element = getMutationTargetElement(mutation);
  return element?.getAttribute("class") ?? mutation.target.nodeName;
}

function getMutationTargetElement(mutation: MutationRecord): Element | null {
  return mutation.target instanceof Element
    ? mutation.target
    : mutation.target.parentElement;
}

function dispatchPointerEvent(
  element: HTMLElement,
  type: string,
  init: PointerEventInit,
): void {
  element.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    pointerType: "mouse",
    ...init,
  }));
}

function dispatchMouseEvent(
  element: HTMLElement,
  type: string,
  init: MouseEventInit,
): void {
  element.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    ...init,
  }));
}

function clickElementCenter(element: HTMLElement): void {
  const { clientX, clientY, hitTarget } = getElementCenterHitTarget(element);
  dispatchPointerClick(hitTarget, clientX, clientY);
}

function getElementCenterHitTarget(element: HTMLElement): {
  readonly clientX: number;
  readonly clientY: number;
  readonly hitTarget: Element;
} {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + (rect.width / 2);
  const clientY = rect.top + (rect.height / 2);
  const hitTarget = element.ownerDocument.elementFromPoint(clientX, clientY);
  assert.ok(hitTarget);
  assert.ok(
    hitTarget instanceof HTMLElement || hitTarget instanceof SVGElement,
    `Expected hit target to be an element, got ${hitTarget.nodeName}`,
  );
  return { clientX, clientY, hitTarget };
}

function dispatchPointerClick(target: Element, clientX: number, clientY: number): void {
  target.dispatchEvent(new PointerEvent("pointerdown", {
    bubbles: true,
    button: 0,
    buttons: 1,
    cancelable: true,
    clientX,
    clientY,
    pointerId: 31,
    pointerType: "mouse",
  }));
  target.dispatchEvent(new PointerEvent("pointerup", {
    bubbles: true,
    button: 0,
    buttons: 0,
    cancelable: true,
    clientX,
    clientY,
    pointerId: 31,
    pointerType: "mouse",
  }));
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
  }));
}

function getVisibleCell(root: HTMLElement, rowIndex: number, colIndex: number): HTMLElement {
  const cell = findVisibleCell(root, rowIndex, colIndex);
  if (!cell) {
    assert.fail(`Expected visible cell ${rowIndex}:${colIndex}`);
  }
  return cell;
}

function findVisibleCell(root: HTMLElement, rowIndex: number, colIndex: number): HTMLElement | undefined {
  const cells = root.querySelectorAll<HTMLElement>(
    `.table_view_cell[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
  );
  for (const cell of Array.from(cells)) {
    if (!cell.hidden) {
      return cell;
    }
  }
  return undefined;
}

function getVisibleCellText(root: HTMLElement, rowIndex: number, colIndex: number): string | undefined {
  return findVisibleCell(root, rowIndex, colIndex)?.textContent ?? undefined;
}

function getVisibleColumnHeaderText(root: HTMLElement, colIndex: number): string | undefined {
  const cells = root.querySelectorAll<HTMLElement>(
    `.table_view_grid_header_cell[aria-colindex="${colIndex + 1}"]`,
  );
  for (const cell of Array.from(cells)) {
    if (!cell.hidden) {
      return cell.querySelector<HTMLButtonElement>(
        ".table_view_column_button",
      )?.textContent ?? undefined;
    }
  }
  return undefined;
}

function getVisibleCellTitle(root: HTMLElement, rowIndex: number, colIndex: number): string | undefined {
  return findVisibleCell(root, rowIndex, colIndex)?.getAttribute("title") ?? undefined;
}

function getHoverLineText(content: IManagedHoverContentOrFactory | undefined): string | undefined {
  if (!(content instanceof HTMLElement)) {
    return typeof content === "string" ? content : undefined;
  }
  return Array.from(content.children)
    .map(child => child.textContent ?? "")
    .join("\n");
}

const noopDisposable = (): void => undefined;

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class TestHoverDelegate implements IHoverDelegate {
  public readonly hovers: TestManagedHover[] = [];

  public setupManagedHover(
    target: HTMLElement,
    content: IManagedHoverContentOrFactory,
    _options?: IManagedHoverOptions,
  ): IManagedHover {
    const hover = new TestManagedHover(target, content);
    this.hovers.push(hover);
    return hover;
  }
}

class TestManagedHover implements IManagedHover {
  public disposed = false;

  constructor(
    public readonly target: HTMLElement,
    public content: IManagedHoverContentOrFactory,
  ) {}

  public show(): void {}

  public hide(): void {}

  public update(content: IManagedHoverContent): void {
    this.content = content;
  }

  public dispose(): void {
    this.disposed = true;
  }
}
