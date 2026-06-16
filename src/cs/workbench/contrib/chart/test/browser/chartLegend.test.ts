import assert from "assert";

import {
  createLegendPopover,
  getLegendDefaultLabel,
  resolveLegendLabelOverride,
} from "src/cs/workbench/contrib/chart/browser/chartLegend";
import type { PlotMainSeries } from "src/cs/workbench/services/plot/common/plotModel";

suite("workbench/contrib/chart/test/browser/chartLegend", () => {
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("renders the editing legend item inline and commits with Enter", async () => {
    const commits: Array<{ legendKey: string; nextLabel: string }> = [];
    const legend = createLegendPopover({
      fileId: "file-a",
      plotType: "iv",
      seriesList: [createSeries("series-a", "Original")],
    }, {
      editingLegendKey: "series-a",
      onCommitLegendItemEdit: (legendKey, nextLabel) => {
        commits.push({ legendKey, nextLabel });
      },
    });
    const input = findElement(legend as unknown as FakeElement, element => element.tagName === "INPUT");

    assert.ok(input);
    assert.ok(input.className.includes("chart_legend_inline_input"));
    assert.equal(input.value, "Original");

    await Promise.resolve();
    assert.equal(input.focusCount, 1);
    assert.equal(input.selectCount, 1);

    input.value = "Edited";
    input.dispatchEvent({ type: "input" });
    input.dispatchEvent(createKeyboardEvent("keydown", "Enter"));

    assert.deepEqual(commits, [
      { legendKey: "series-a", nextLabel: "Edited" },
    ]);
  });

  test("disposes the inline editor when the popover is disposed", () => {
    const legend = createLegendPopover({
      fileId: "file-a",
      plotType: "iv",
      seriesList: [createSeries("series-a", "Original")],
    }, {
      editingLegendKey: "series-a",
    });
    const input = findElement(legend as unknown as FakeElement, element => element.tagName === "INPUT");

    assert.ok(input);
    assert.ok(input.listenerCount > 0);

    legend.dispose();

    assert.equal(input.listenerCount, 0);
  });

  test("resolves empty legend edits as default-label reset", () => {
    assert.deepEqual([
      resolveLegendLabelOverride("", "Original"),
      resolveLegendLabelOverride("   ", "Original"),
      resolveLegendLabelOverride("Original", "Original"),
      resolveLegendLabelOverride("  Edited  ", "Original"),
    ], [
      null,
      null,
      null,
      "Edited",
    ]);
  });

  test("uses fallback legend default label when series name is missing", () => {
    assert.equal(getLegendDefaultLabel({ id: "series-a" } as PlotMainSeries, 0), "Series 1");
  });
});

const createSeries = (id: string, name: string): PlotMainSeries => ({
  data: [],
  id,
  name,
} as unknown as PlotMainSeries);

type FakeKeyboardEvent = {
  readonly key: string;
  readonly type: string;
  preventDefault(): void;
  stopPropagation(): void;
};

const createKeyboardEvent = (type: string, key: string): FakeKeyboardEvent => ({
  key,
  type,
  preventDefault: () => undefined,
  stopPropagation: () => undefined,
});

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly style: Record<string, string> = {};
  className = "";
  disabled = false;
  id = "";
  innerHTML = "";
  isConnected = true;
  name = "";
  placeholder = "";
  readOnly = false;
  textContent = "";
  type = "";
  value = "";
  focusCount = 0;
  parentElement: FakeElement | null = null;
  selectCount = 0;

  public constructor(readonly tagName: string) {}

  public get listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  appendChild(node: FakeElement): FakeElement {
    node.parentElement = this;
    node.isConnected = this.isConnected;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) {
      child.parentElement = null;
      child.isConnected = false;
    }
    this.children.length = 0;
    this.append(...nodes);
  }

  remove(): void {
    this.parentElement?.removeChild(this);
    this.parentElement = null;
    this.isConnected = false;
  }

  removeChild(node: FakeElement): void {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    node.parentElement = null;
    node.isConnected = false;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { readonly type: string }): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  }

  focus(): void {
    this.focusCount += 1;
  }

  blur(): void {
    this.dispatchEvent({ type: "blur" });
  }

  select(): void {
    this.selectCount += 1;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

const createFakeDocument = () => ({
  createElement: (tagName: string) => new FakeElement(tagName.toUpperCase()) as unknown as HTMLElement,
});

const findElement = (
  root: FakeElement,
  predicate: (element: FakeElement) => boolean,
): FakeElement | null => {
  if (predicate(root)) {
    return root;
  }

  for (const child of root.children) {
    const result = findElement(child, predicate);
    if (result) {
      return result;
    }
  }

  return null;
};
