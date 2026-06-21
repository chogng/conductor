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
  type TableWidgetSelectionTarget,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import { getTableColumnHeaderSelectionMode } from "src/cs/workbench/contrib/table/browser/tableViewPane";
import type {
  TableSelection,
  TableRowsVersionChangeEvent,
  TableState,
} from "src/cs/workbench/services/table/common/table";
import { toScaleHeaderSuffix } from "src/cs/workbench/services/table/common/numericFormat";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/browser/workbench tableWidget layout", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps template modes to table column header selection modes", () => {
    assert.equal(getTableColumnHeaderSelectionMode("management"), "single");
    assert.equal(getTableColumnHeaderSelectionMode("editor"), "multi");
  });

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

  test("fills wide viewports with bounded virtual empty columns", async () => {
    const widget = new TableWidget({
      onSelect: () => true,
      tableModel: {
        ...createTableWidgetModel(),
        getRow: rowIndex => [
          `A${rowIndex + 1}`,
          `B${rowIndex + 1}`,
          `C${rowIndex + 1}`,
        ],
      },
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
      widget.dispose();
    }
  });

  test("refreshes column scale headers when rows version changes", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    const widget = new TableWidget({
      onSelect: () => true,
      tableModel: dynamicModel.model,
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

  test("patches only visible content dirty cells", async () => {
    const dynamicModel = createContentDirtyTableWidgetModel();
    const widget = new TableWidget({
      onSelect: () => true,
      tableModel: dynamicModel.model,
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

  test("adjusts column scale from the header stepper", async () => {
    const dynamicModel = createDynamicScaleTableWidgetModel();
    const widget = new TableWidget({
      onSelect: () => true,
      tableModel: dynamicModel.model,
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

      widget.element.querySelector<HTMLButtonElement>(".table_view_column_scale_button_plus")?.click();
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁵");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "0.1");

      widget.element.querySelector<HTMLButtonElement>(".table_view_column_scale_button_minus")?.click();
      widget.element.querySelector<HTMLButtonElement>(".table_view_column_scale_button_minus")?.click();
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁷");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "10");

      widget.element.querySelector<HTMLButtonElement>(".table_view_column_scale_value")?.click();
      assert.equal(getVisibleScaleText(widget.element), "×10⁻⁶");
      assert.equal(getVisibleCellText(widget.element, 0, 0), "1");
    } finally {
      widget.dispose();
    }
  });

  test("uses single-toggle selection for column header clicks by default", async () => {
    let selection: TableSelection = {};
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      onSelect: target => {
        selection = applySelectionTarget(selection, target);
        selectedColumns.push([...(selection.selectedColumns ?? [])]);
        return true;
      },
      tableModel: createTableWidgetModel(() => selection),
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

  test("keeps additive column header selection when multi mode is requested", async () => {
    let selection: TableSelection = {};
    const selectedColumns: number[][] = [];
    const widget = new TableWidget({
      columnHeaderSelectionMode: "multi",
      onSelect: target => {
        selection = applySelectionTarget(selection, target);
        selectedColumns.push([...(selection.selectedColumns ?? [])]);
        return true;
      },
      tableModel: createTableWidgetModel(() => selection),
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
    let selection: TableSelection = {};
    const selectionListeners = new Set<(selection: TableSelection) => void>();
    const selectedTargets: (TableWidgetSelectionTarget | null)[] = [];
    const widget = new TableWidget({
      onSelect: target => {
        selectedTargets.push(target);
        selection = applySelectionTarget(selection, target);
        for (const callback of Array.from(selectionListeners)) {
          callback(selection);
        }
        return true;
      },
      tableModel: createTableWidgetModel(() => selection, {
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

    try {
      const viewport = widget.element.querySelector<HTMLElement>(".table_view_preview");
      assert.ok(viewport);
      setElementClientSize(viewport, 500, 280);
      widget.layout();
      await timeout(120);

      const startCell = getVisibleCell(widget.element, 0, 0);
      const innerCell = getVisibleCell(widget.element, 1, 1);
      const endCell = getVisibleCell(widget.element, 2, 2);
      document.getSelection()?.selectAllChildren(startCell);
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
        fileId: "file-a",
        rowIndex: 2,
        sheetId: null,
      });
      assert.deepEqual(selection.ranges, [{
        endCol: 2,
        endRow: 2,
        startCol: 0,
        startRow: 0,
        fileId: "file-a",
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
      widget.dispose();
    }
  });
});

function createTableWidgetState(
  options: {
    readonly columnCount?: number;
  } = {},
): TableState {
  const columnCount = options.columnCount ?? 10;
  return {
    dimensions: `20 x ${columnCount}`,
    file: {
      columnCount,
      fileId: "file-a",
      fileName: "sample.csv",
      maxCellLengths: Array.from({ length: columnCount }, () => 2),
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

function createTableWidgetModel(
  getSelection: () => TableSelection = () => ({}),
  options: {
    readonly onDidChangeSelection?: TableWidgetModel["onDidChangeSelection"];
  } = {},
): TableWidgetModel {
  return {
    adjustColumnDisplayScale: () => false,
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
    getSelection,
    getState: createTableWidgetState,
    onDidChangeHighlight: () => noopDisposable,
    onDidChangeRevealCell: () => noopDisposable,
    onDidChangeSelection: options.onDidChangeSelection ?? (() => noopDisposable),
    onDidChangeState: () => noopDisposable,
    resetColumnDisplayScale: () => false,
    subscribeRowsVersion: () => noopDisposable,
  };
}

function applySelectionTarget(
  selection: TableSelection,
  target: TableWidgetSelectionTarget | null,
): TableSelection {
  if (!target) {
    return {};
  }

  if (target.kind === "columns") {
    return {
      ...selection,
      activeCell: undefined,
      ranges: undefined,
      selectedColumns: target.columns,
    };
  }

  if (target.kind === "cell") {
    return {
      activeCell: target.cell,
      selectedColumns: selection.selectedColumns ?? [],
    };
  }

  return {
    activeCell: {
      colIndex: target.range.endCol,
      fileId: target.range.fileId ?? null,
      rowIndex: target.range.endRow,
      sheetId: target.range.sheetId ?? null,
    },
    ranges: [target.range],
    selectedColumns: selection.selectedColumns ?? [],
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

function createContentDirtyTableWidgetModel(): {
  readonly model: TableWidgetModel;
  readonly fireRowsVersion: (change: Omit<TableRowsVersionChangeEvent, "version">) => void;
  readonly setCell: (rowIndex: number, colIndex: number, value: string) => void;
} {
  let rowsVersion = 1;
  const subscribers = new Set<(event: TableRowsVersionChangeEvent) => void>();
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
      const event: TableRowsVersionChangeEvent = {
        ...change,
        version: rowsVersion,
      };
      for (const callback of Array.from(subscribers)) {
        callback(event);
      }
    },
    model: {
      ...createTableWidgetModel(),
      getRow: rowIndex => rows[rowIndex] ?? [],
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
  readonly model: TableWidgetModel;
  readonly fireRowsVersion: () => void;
  readonly setScaleExponent: (scaleExponent: number) => void;
} {
  let rowsVersion = 1;
  let scaleExponent = -6;
  let isScaleManual = false;
  const subscribers = new Set<(event: TableRowsVersionChangeEvent) => void>();
  const fireRowsVersion = () => {
    rowsVersion += 1;
    const event: TableRowsVersionChangeEvent = {
      full: true,
      kind: "display",
      ranges: [],
      version: rowsVersion,
    };
    for (const callback of Array.from(subscribers)) {
      callback(event);
    }
  };

  return {
    fireRowsVersion,
    model: {
      ...createTableWidgetModel(),
      adjustColumnDisplayScale: (_colIndex, deltaExponent) => {
        scaleExponent += Math.trunc(Number(deltaExponent) || 0);
        isScaleManual = true;
        fireRowsVersion();
        return true;
      },
      getColumnDisplayProfile: () => createScaledColumnDisplayProfile(scaleExponent, isScaleManual),
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
      getRowsVersion: () => rowsVersion,
      subscribeRowsVersion: callback => {
        subscribers.add(callback);
        return () => {
          subscribers.delete(callback);
        };
      },
      resetColumnDisplayScale: () => {
        scaleExponent = -6;
        isScaleManual = false;
        fireRowsVersion();
        return true;
      },
    },
    setScaleExponent: nextScaleExponent => {
      scaleExponent = nextScaleExponent;
    },
  };
}

function createScaledColumnDisplayProfile(scaleExponent: number, isScaleManual = false): ColumnDisplayProfile {
  return {
    rawTableId: "file-a",
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
    ".table_view_column_scale_control:not([hidden]) .table_view_column_scale_value",
  )?.textContent ?? undefined;
}

function getColumnHeaderButton(element: HTMLElement, colIndex: number): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>(
    `.table_view_column_button[data-col-index="${colIndex}"]`,
  );
  assert.ok(button);
  return button;
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
