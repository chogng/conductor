import assert from "assert";

import { PlotAxisTitleView } from "src/cs/workbench/contrib/plot/browser/plotAxisTitleView";

suite("workbench/contrib/plot/test/browser/plotAxisTitleView", () => {
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("edits x axis title inline and commits with Enter", async () => {
    const changes: string[] = [];
    const view = new PlotAxisTitleView({
      onXTitleChange: (nextTitle) => {
        changes.push(nextTitle);
      },
      xTitle: "Vd (V)",
      yTitle: "Id (A)",
    });

    assert.equal(view.editAxisTitle("x"), true);
    const input = findElement(view.element as unknown as FakeElement, element => element.tagName === "INPUT");

    assert.ok(input);
    assert.equal(input.value, "Vd (V)");
    assert.ok(input.className.includes("plot_main_chart_axis_title_editor_input"));
    assert.equal(findClass(view.element as unknown as FakeElement, "inputbox_native"), null);

    await Promise.resolve();
    assert.equal(input.focusCount, 1);
    assert.equal(input.selectCount, 1);

    input.value = "Gate Voltage";
    input.dispatchEvent({ type: "input" });
    input.dispatchEvent(createKeyboardEvent("keydown", "Enter"));

    assert.deepEqual(changes, ["Gate Voltage"]);
    assert.equal(findElement(view.element as unknown as FakeElement, element => element.tagName === "INPUT"), null);
    view.dispose();
  });

  test("cancels y axis title edit with Escape", () => {
    const changes: string[] = [];
    const view = new PlotAxisTitleView({
      onYTitleChange: (nextTitle) => {
        changes.push(nextTitle);
      },
      xTitle: "Vd (V)",
      yTitle: "Id (A)",
    });

    assert.equal(view.editAxisTitle("y"), true);
    const input = findElement(view.element as unknown as FakeElement, element => element.tagName === "INPUT");

    assert.ok(input);
    input.value = "Drain Current";
    input.dispatchEvent({ type: "input" });
    input.dispatchEvent(createKeyboardEvent("keydown", "Escape"));

    assert.deepEqual(changes, []);
    assert.equal(findElement(view.element as unknown as FakeElement, element => element.tagName === "INPUT"), null);
    view.dispose();
  });

  test("does not enter edit mode when axis has no change handler", () => {
    const view = new PlotAxisTitleView({
      xTitle: "Vd (V)",
      yTitle: "Id (A)",
    });

    assert.equal(view.editAxisTitle("x"), false);
    assert.equal(view.editAxisTitle("y"), false);
    assert.equal(findElement(view.element as unknown as FakeElement, element => element.tagName === "INPUT"), null);
    view.dispose();
  });
});

type FakeKeyboardEvent = {
  readonly key: string;
  readonly type: string;
  preventDefault(): void;
};

const createKeyboardEvent = (type: string, key: string): FakeKeyboardEvent => ({
  key,
  type,
  preventDefault: () => undefined,
});

class FakeStyle {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly style = new FakeStyle();
  className = "";
  focusCount = 0;
  isConnected = true;
  parentElement: FakeElement | null = null;
  readOnly = false;
  selectCount = 0;
  tabIndex = -1;
  title = "";
  type = "";
  value = "";
  private currentTextContent = "";

  public constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.currentTextContent;
  }

  set textContent(value: string) {
    this.currentTextContent = value;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  appendChild(node: FakeElement): FakeElement {
    node.parentElement = this;
    node.setConnected(this.isConnected);
    this.children.push(node);
    return node;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
    this.setConnected(false);
  }

  removeChild(node: FakeElement): void {
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    node.parentElement = null;
    node.setConnected(false);
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

  blur(): void {
    this.dispatchEvent({ type: "blur" });
  }

  focus(): void {
    this.focusCount += 1;
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

  getBoundingClientRect(): { readonly width: number } {
    return { width: Math.max(40, this.textContent.length * 8) };
  }

  querySelector(selector: string): FakeElement | null {
    if (!selector.startsWith(".")) {
      return null;
    }
    return findClass(this, selector.slice(1));
  }

  private setConnected(isConnected: boolean): void {
    this.isConnected = isConnected;
    for (const child of this.children) {
      child.setConnected(isConnected);
    }
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

const findClass = (root: FakeElement, className: string): FakeElement | null =>
  findElement(root, element => element.className.split(" ").includes(className));
