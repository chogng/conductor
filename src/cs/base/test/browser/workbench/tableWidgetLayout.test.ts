/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  TableWidget,
  type TableWidgetModel,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import type {
  TableSelection,
  TableState,
} from "src/cs/workbench/services/table/common/table";

suite("base/browser/workbench tableWidget layout", () => {
  test("rerenders visible cells when layout changes the viewport width", async () => {
    const widget = new TableWidget({
      onSelect: () => true,
      tableModel: createTableWidgetModel(),
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
});

function createTableWidgetState(): TableState {
  return {
    dimensions: "20 x 10",
    file: {
      columnCount: 10,
      fileId: "file-a",
      fileName: "sample.csv",
      maxCellLengths: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      rowCount: 20,
      sourceKey: "file-a",
    },
    fileName: "sample.csv",
    loadState: {
      message: "",
      state: "ready",
    },
    selectedFileId: "file-a",
    sourceKey: "file-a",
  };
}

function createTableWidgetModel(): TableWidgetModel {
  return {
    ensureRows: async () => undefined,
    getHighlight: () => ({}),
    getRow: rowIndex => [
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
    ],
    getRowsVersion: () => 1,
    getSelection: (): TableSelection => ({}),
    getState: createTableWidgetState,
    onDidChangeHighlight: () => noopDisposable,
    onDidChangeRevealCell: () => noopDisposable,
    onDidChangeSelection: () => noopDisposable,
    onDidChangeState: () => noopDisposable,
    subscribeRowsVersion: () => noopDisposable,
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

function getVisibleCellText(root: HTMLElement, rowIndex: number, colIndex: number): string | undefined {
  const cells = root.querySelectorAll<HTMLElement>(
    `.table_view_cell[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
  );
  for (const cell of Array.from(cells)) {
    if (!cell.hidden) {
      return cell.textContent ?? "";
    }
  }
  return undefined;
}

const noopDisposable = (): void => undefined;

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
