/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type {
  IManagedHover,
  IManagedHoverContent,
  IManagedHoverContentOrFactory,
  IManagedHoverOptions,
} from "src/cs/base/browser/ui/hover/hover";
import type { IHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import {
  TableWidget,
  type TableWidgetModel,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import type {
  TableSelection,
  TableState,
} from "src/cs/workbench/services/table/common/table";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/browser/workbench tableWidget layout", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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

  test("renders scaled numeric cells from column display profiles", async () => {
    const hoverDelegate = new TestHoverDelegate();
    const widget = new TableWidget({
      hoverDelegate,
      onSelect: () => true,
      tableModel: createSmartTableWidgetModel(),
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
        "A ×10⁻⁹",
      );
      assert.equal(getVisibleCellText(widget.element, 0, 0), "-3.70327");
      assert.equal(
        getVisibleCellTitle(widget.element, 0, 0),
        undefined,
      );
      assert.equal(
        getHoverLineText(hoverDelegate.hovers[0]?.content),
        "Raw: -3.70327E-009\nDisplay: -3.70327 ×10⁻⁹",
      );
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
    getColumnDisplayProfile: colIndex => createRawColumnDisplayProfile(colIndex),
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

function createSmartTableWidgetModel(): TableWidgetModel {
  const profile: ColumnDisplayProfile = {
    rawTableId: "file-a",
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
    ...createTableWidgetModel(),
    getColumnDisplayProfile: () => profile,
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
  };
}

function createRawColumnDisplayProfile(colIndex: number): ColumnDisplayProfile {
  return {
    rawTableId: "file-a",
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

function getVisibleCellTitle(root: HTMLElement, rowIndex: number, colIndex: number): string | undefined {
  const cells = root.querySelectorAll<HTMLElement>(
    `.table_view_cell[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
  );
  for (const cell of Array.from(cells)) {
    if (!cell.hidden) {
      return cell.getAttribute("title") ?? undefined;
    }
  }
  return undefined;
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
