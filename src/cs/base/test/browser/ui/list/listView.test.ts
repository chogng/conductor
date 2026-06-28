import assert from "assert";

import { DataTransfers } from "src/cs/base/browser/dnd";
import {
  ListDragOverEffectPosition,
  ListDragOverEffectType,
  type IListDragOverReaction,
} from "src/cs/base/browser/ui/list/list";
import {
  ListView,
  ListViewTargetSector,
  type IListViewDragAndDrop,
} from "src/cs/base/browser/ui/list/listView";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/list/listView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("exposes elements, dom elements, mouse events and context menu", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const list = createStringListView(host, ["alpha", "beta"]);
    const clicks: Array<string | undefined> = [];
    const contextIndexes: Array<number | undefined> = [];
    const disposables = [
      list.onMouseClick(event => clicks.push(event.element)),
      list.onContextMenu(event => contextIndexes.push(event.index)),
    ];

    try {
      const row = list.domElement(1);
      assert.ok(row);

      assert.equal(list.domNode, host.querySelector(".ui-list"));
      assert.equal(list.length, 2);
      assert.equal(list.element(1), "beta");
      assert.equal(list.indexOf("beta"), 1);
      assert.equal(row.textContent, "beta");

      row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

      assert.deepEqual(clicks, ["beta"]);
      assert.deepEqual(contextIndexes, [1]);
    } finally {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      list.dispose();
      host.remove();
    }
  });

  test("fires onDidScroll when scroll position changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const list = createStringListView(
      host,
      Array.from({ length: 20 }, (_, index) => `item ${index}`),
      { minVirtualCount: 1 },
    );
    let scrollCount = 0;
    const listener = list.onDidScroll(() => {
      scrollCount += 1;
    });

    try {
      list.layout(48, 200);
      list.scrollToEnd("auto");
      await animationFrame();

      assert.ok(list.contentHeight > 48);
      assert.equal(scrollCount, 1);
    } finally {
      listener.dispose();
      list.dispose();
      host.remove();
    }
  });

  test("delegates row drag and drop through list dnd", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const events: string[] = [];
    let dragOverData: unknown;
    let droppedData: unknown;
    let droppedElement: string | undefined;
    let droppedIndex: number | undefined;
    let droppedSector: ListViewTargetSector | undefined;

    const dnd: IListViewDragAndDrop<string> = {
      dispose: () => events.push("dispose"),
      getDragElements: element => [`${element}:dragged`],
      getDragURI: element => `test:${element}`,
      onDragStart: data => {
        events.push("dragstart");
        assert.deepEqual(data.getData(), ["alpha:dragged"]);
      },
      onDragOver: (
        data,
        targetElement,
        targetIndex,
        targetSector,
      ): IListDragOverReaction => {
        events.push(`dragover:${targetElement}:${targetIndex}:${targetSector}`);
        dragOverData = data.getData();
        return {
          accept: true,
          effect: {
            position: ListDragOverEffectPosition.Before,
            type: ListDragOverEffectType.Copy,
          },
        };
      },
      drop: (data, targetElement, targetIndex, targetSector) => {
        events.push("drop");
        droppedData = data.getData();
        droppedElement = targetElement;
        droppedIndex = targetIndex;
        droppedSector = targetSector;
      },
    };

    const list = new ListView(host, {
      delegate: {
        getHeight: () => 24,
        getTemplateId: () => "row",
      },
      dnd,
      getKey: item => item,
      items: ["alpha", "beta"],
      renderers: [{
        templateId: "row",
        renderTemplate: container => container,
        renderElement: (element, _index, container) => {
          container.textContent = element;
        },
        disposeTemplate: () => undefined,
      }],
    });

    try {
      const rows = host.querySelectorAll<HTMLElement>(".ui-list__row");
      assert.equal(rows.length, 2);
      assert.equal(rows[0].draggable, true);

      dispatchDragEvent(rows[0], "dragstart", createDataTransfer());

      const dragOverTransfer = createDataTransfer();
      const dragOverEvent = dispatchDragEvent(rows[1], "dragover", dragOverTransfer, {
        clientY: 0,
      });
      assert.equal(dragOverEvent.defaultPrevented, true);
      assert.equal(dragOverTransfer.dropEffect, "copy");
      assert.equal(rows[1].classList.contains(ListDragOverEffectPosition.Before), true);
      assert.deepEqual(dragOverData, ["alpha:dragged"]);

      dispatchDragEvent(rows[1], "drop", dragOverTransfer, { clientY: 0 });

      assert.deepEqual(droppedData, ["alpha:dragged"]);
      assert.equal(droppedElement, "beta");
      assert.equal(droppedIndex, 1);
      assert.equal(droppedSector, ListViewTargetSector.TOP);
      assert.equal(rows[1].classList.contains(ListDragOverEffectPosition.Before), false);
      assert.equal(dragOverTransfer.getData(DataTransfers.TEXT), "external");
      assert.deepEqual(events, [
        "dragstart",
        "dragover:beta:1:0",
        "drop",
      ]);
    } finally {
      list.dispose();
      host.remove();
    }
  });

  test("keeps drag feedback briefly after drag leave", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dnd: IListViewDragAndDrop<string> = {
      dispose: () => undefined,
      getDragElements: element => [element],
      getDragURI: element => `test:${element}`,
      onDragOver: (): IListDragOverReaction => ({
        accept: true,
        effect: {
          position: ListDragOverEffectPosition.Before,
          type: ListDragOverEffectType.Move,
        },
      }),
      drop: () => undefined,
    };

    const list = createStringListView(host, ["alpha", "beta"], { dnd });

    try {
      const rows = host.querySelectorAll<HTMLElement>(".ui-list__row");
      dispatchDragEvent(rows[0], "dragstart", createDataTransfer());
      dispatchDragEvent(rows[1], "dragover", createDataTransfer(), { clientY: 0 });

      assert.equal(rows[1].classList.contains(ListDragOverEffectPosition.Before), true);

      dispatchDragEvent(rows[1], "dragleave", createDataTransfer(), { clientY: 0 });

      assert.equal(rows[1].classList.contains(ListDragOverEffectPosition.Before), true);

      await timeout(120);

      assert.equal(rows[1].classList.contains(ListDragOverEffectPosition.Before), false);
    } finally {
      list.dispose();
      host.remove();
    }
  });

  test("normalizes after feedback to before feedback on the next row", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dnd: IListViewDragAndDrop<string> = {
      dispose: () => undefined,
      getDragElements: element => [element],
      getDragURI: element => `test:${element}`,
      onDragOver: (): IListDragOverReaction => ({
        accept: true,
        effect: {
          position: ListDragOverEffectPosition.After,
          type: ListDragOverEffectType.Move,
        },
        feedback: [0],
      }),
      drop: () => undefined,
    };

    const list = createStringListView(host, ["alpha", "beta"], { dnd });

    try {
      const rows = host.querySelectorAll<HTMLElement>(".ui-list__row");
      dispatchDragEvent(rows[0], "dragstart", createDataTransfer());
      dispatchDragEvent(rows[0], "dragover", createDataTransfer(), { clientY: 20 });

      assert.equal(rows[0].classList.contains(ListDragOverEffectPosition.After), false);
      assert.equal(rows[1].classList.contains(ListDragOverEffectPosition.Before), true);
    } finally {
      list.dispose();
      host.remove();
    }
  });
});

function createStringListView(
  host: HTMLElement,
  items: readonly string[],
  options: {
    readonly dnd?: IListViewDragAndDrop<string>;
    readonly minVirtualCount?: number;
  } = {},
): ListView<string> {
  return new ListView(host, {
    delegate: {
      getHeight: () => 24,
      getTemplateId: () => "row",
    },
    dnd: options.dnd,
    getKey: item => item,
    items: [...items],
    minVirtualCount: options.minVirtualCount,
    renderers: [{
      templateId: "row",
      renderTemplate: container => container,
      renderElement: (element, _index, container) => {
        container.textContent = element;
      },
      disposeTemplate: () => undefined,
    }],
  });
}

function animationFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

function timeout(millis: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, millis));
}

function dispatchDragEvent(
  target: HTMLElement,
  type: string,
  dataTransfer: TestDataTransfer,
  options: { readonly clientY?: number } = {},
): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: dataTransfer,
  });
  Object.defineProperty(event, "clientY", {
    value: options.clientY ?? 0,
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
    } else {
      this.values.clear();
    }
  }

  public getData(format: string): string {
    return this.values.get(format) ?? "";
  }

  public setData(format: string, data: string): void {
    this.values.set(format, data);
  }
}
