import assert from "assert";

import { DataTransfers } from "src/cs/base/browser/dnd";
import { type IListDragAndDrop, type IListRenderer } from "src/cs/base/browser/ui/list/list";
import { List, TypeNavigationMode } from "src/cs/base/browser/ui/list/listWidget";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/list/listWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("owns selection over ListView", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const events: string[] = [];
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta"],
      renderers: [textRenderer],
    });
    const listener = list.onDidChangeSelection(event => {
      events.push(event.elements[0] ?? "");
    });

    try {
      list.setSelection([1]);

      assert.deepEqual(list.getSelection(), [1]);
      assert.deepEqual(list.getSelectedElements(), ["beta"]);
      assert.deepEqual(events, ["beta"]);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("memoizes derived trait event getters", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha"],
      renderers: [textRenderer],
    });

    try {
      const onDidChangeFocus = list.onDidChangeFocus;
      const onDidChangeSelection = list.onDidChangeSelection;

      assert.equal(list.onDidChangeFocus, onDidChangeFocus);
      assert.equal(list.onDidChangeSelection, onDidChangeSelection);
    } finally {
      list.dispose();
      container.remove();
    }
  });

  test("fires selection change when selected item is removed", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const events: string[][] = [];
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta"],
      renderers: [textRenderer],
    });
    const listener = list.onDidChangeSelection(event => {
      events.push([...event.elements]);
    });

    try {
      list.setSelection([1]);
      list.setItems(["alpha"]);

      assert.deepEqual(list.getSelection(), []);
      assert.deepEqual(list.getSelectedElements(), []);
      assert.deepEqual(events, [["beta"], []]);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("throws when selecting an invalid index", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta"],
      renderers: [textRenderer],
    });

    try {
      list.setSelection([1]);

      let error: unknown;
      try {
        list.setSelection([-1]);
      } catch (caught) {
        error = caught;
      }

      assert.ok(error instanceof Error);
      assert.ok(/Invalid index -1/.test(error.message));
      assert.deepEqual(list.getSelection(), [1]);
      assert.deepEqual(list.getSelectedElements(), ["beta"]);
    } finally {
      list.dispose();
      container.remove();
    }
  });

  test("splices selection through the trait splice chain", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const events: string[][] = [];
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta"],
      renderers: [textRenderer],
    });
    const listener = list.onDidChangeSelection(event => {
      events.push([...event.elements]);
    });

    try {
      list.setSelection([1]);
      list.splice(0, 0, ["zero"]);

      assert.deepEqual(list.getSelection(), [2]);
      assert.deepEqual(list.getSelectedElements(), ["beta"]);
      assert.deepEqual(events, [["beta"], ["beta"]]);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("preserves selected inserted elements by key during splice", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const events: string[][] = [];
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item.id,
      items: [
        { id: "alpha", label: "Alpha" },
        { id: "beta", label: "Beta" },
      ],
      renderers: [objectRenderer],
    });
    const listener = list.onDidChangeSelection(event => {
      events.push(event.elements.map(element => element.label));
    });

    try {
      list.setSelection([1]);
      list.splice(1, 1, [{ id: "beta", label: "Beta replacement" }]);

      assert.deepEqual(list.getSelection(), [1]);
      assert.deepEqual(list.getSelectedElements(), [{ id: "beta", label: "Beta replacement" }]);
      assert.deepEqual(events, [["Beta"]]);
    } finally {
      listener.dispose();
      list.dispose();
      container.remove();
    }
  });

  test("emits widget dom events with list targets", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta"],
      renderers: [textRenderer],
    });
    const keys: string[] = [];
    const clicks: Array<string | undefined> = [];
    const contextIndexes: Array<number | undefined> = [];
    const disposables = [
      list.onKeyDown(event => keys.push(event.key)),
      list.onMouseClick(event => clicks.push(event.element)),
      list.onContextMenu(event => contextIndexes.push(event.index)),
    ];

    try {
      const row = container.querySelector<HTMLElement>(".ui-list__row[data-index='1']");
      assert.ok(row);

      list.getViewport().dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "x",
      }));
      row.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
      }));
      row.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
      }));

      assert.deepEqual(keys, ["x"]);
      assert.deepEqual(clicks, ["beta"]);
      assert.deepEqual(contextIndexes, [1]);
    } finally {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      list.dispose();
      container.remove();
    }
  });

  test("keyboard controller moves focus and selects focused element", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta", "gamma"],
      renderers: [textRenderer],
    });

    try {
      const viewport = list.getViewport();
      viewport.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        code: "ArrowDown",
        key: "ArrowDown",
      }));
      viewport.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        code: "ArrowDown",
        key: "ArrowDown",
      }));
      viewport.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Enter",
        key: "Enter",
      }));

      assert.deepEqual(list.getFocus(), [1]);
      assert.deepEqual(list.getSelection(), [1]);
      assert.deepEqual(list.getSelectedElements(), ["beta"]);
    } finally {
      list.dispose();
      container.remove();
    }
  });

  test("mouse controller updates focus, selection and range selection", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta", "gamma"],
      renderers: [textRenderer],
    });

    try {
      const first = container.querySelector<HTMLElement>(".ui-list__row[data-index='0']");
      const third = container.querySelector<HTMLElement>(".ui-list__row[data-index='2']");
      assert.ok(first);
      assert.ok(third);

      first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      third.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        shiftKey: true,
      }));

      assert.deepEqual(list.getFocus(), [2]);
      assert.deepEqual(list.getSelection(), [0, 1, 2]);
      assert.deepEqual(list.getSelectedElements(), ["alpha", "beta", "gamma"]);
    } finally {
      list.dispose();
      container.remove();
    }
  });

  test("type navigation focuses matching element", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha", "beta", "gamma"],
      keyboardNavigationLabelProvider: {
        getKeyboardNavigationLabel: item => item,
      },
      renderers: [textRenderer],
      typeNavigationMode: TypeNavigationMode.Automatic,
    });

    try {
      list.getViewport().dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        code: "KeyG",
        key: "g",
      }));

      assert.deepEqual(list.getFocus(), [2]);
      assert.deepEqual(list.getFocusedElements(), ["gamma"]);
    } finally {
      list.dispose();
      container.remove();
    }
  });

  test("emits dispose once", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      getKey: item => item,
      items: ["alpha"],
      renderers: [textRenderer],
    });
    let disposeCount = 0;
    const listener = list.onDidDispose(() => {
      disposeCount += 1;
    });

    try {
      list.dispose();
      list.dispose();

      assert.equal(disposeCount, 1);
    } finally {
      listener.dispose();
      container.remove();
    }
  });

  test("delegates drag and drop through widget selection", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const events: string[] = [];
    let dragStartData: unknown;
    let droppedData: unknown;
    let droppedElement: string | undefined;
    let disposed = false;

    const dnd: IListDragAndDrop<string> = {
      dispose: () => events.push("dispose"),
      getDragURI: element => `test:${element}`,
      onDragStart: data => {
        events.push("dragstart");
        dragStartData = data.getData();
      },
      onDragOver: (_data, targetElement) => {
        events.push(`dragover:${targetElement}`);
        return true;
      },
      drop: (data, targetElement) => {
        events.push("drop");
        droppedData = data.getData();
        droppedElement = targetElement;
      },
    };
    const list = new List(container, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      dnd,
      getKey: item => item,
      items: ["alpha", "beta", "gamma"],
      renderers: [textRenderer],
    });

    try {
      list.setSelection([0, 1]);
      const rows = container.querySelectorAll<HTMLElement>(".ui-list__row");
      assert.equal(rows.length, 3);
      assert.equal(rows[1].draggable, true);

      dispatchDragEvent(rows[1], "dragstart", createDataTransfer());
      const dragOverTransfer = createDataTransfer();
      dispatchDragEvent(rows[2], "dragover", dragOverTransfer);
      dispatchDragEvent(rows[2], "drop", dragOverTransfer);

      assert.deepEqual(dragStartData, ["alpha", "beta"]);
      assert.deepEqual(droppedData, ["alpha", "beta"]);
      assert.equal(droppedElement, "gamma");

      list.dispose();
      disposed = true;
      assert.deepEqual(events, [
        "dragstart",
        "dragover:gamma",
        "drop",
        "dispose",
      ]);
    } finally {
      if (!disposed) {
        list.dispose();
      }
      container.remove();
    }
  });
});

const textRenderer: IListRenderer<string, HTMLElement> = {
  templateId: "row",
  renderTemplate: container => container,
  renderElement: (item, _index, container) => {
    container.textContent = item;
  },
  disposeTemplate: () => {},
};

const objectRenderer: IListRenderer<{ readonly id: string; readonly label: string }, HTMLElement> = {
  templateId: "row",
  renderTemplate: container => container,
  renderElement: (item, _index, container) => {
    container.textContent = item.label;
  },
  disposeTemplate: () => {},
};

function dispatchDragEvent(
  target: HTMLElement,
  type: string,
  dataTransfer: TestDataTransfer,
): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: dataTransfer,
  });
  target.dispatchEvent(event);
  return event;
}

function createDataTransfer(): TestDataTransfer {
  const dataTransfer = new TestDataTransfer();
  dataTransfer.setData(DataTransfers.TEXT, "external");
  return dataTransfer;
}

class TestDataTransfer implements Pick<DataTransfer, "clearData" | "dropEffect" | "effectAllowed" | "files" | "getData" | "setData" | "types"> {
  public dropEffect: DataTransfer["dropEffect"] = "none";
  public effectAllowed: DataTransfer["effectAllowed"] = "uninitialized";
  public readonly files = [] as unknown as FileList;
  private readonly values = new Map<string, string>();

  public get types(): readonly string[] {
    return Array.from(this.values.keys());
  }

  public clearData(format?: string): void {
    if (format) {
      this.values.delete(format);
      return;
    }

    this.values.clear();
  }

  public getData(format: string): string {
    return this.values.get(format) ?? "";
  }

  public setData(format: string, data: string): void {
    this.values.set(format, data);
  }
}
