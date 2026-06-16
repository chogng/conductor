import assert from "assert";

import { InlineEditableTextWidget } from "src/cs/base/browser/ui/InlineEditableText/inlineEditableTextWidget";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/test/browser/inlineEditableTextWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("focuses and selects when constructed in editing mode", async () => {
    const widget = createWidget({
      draftValue: "Draft",
      editing: true,
      value: "Value",
    });
    const input = widget.inputElement as unknown as FakeElement & HTMLInputElement;

    assert.equal(input.value, "Draft");
    assert.equal(input.readOnly, false);
    assert.ok(input.className.includes("inline-editable-text__input--editing"));

    await Promise.resolve();

    assert.equal(input.focusCount, 1);
    assert.equal(input.selectCount, 1);
    widget.dispose();
  });

  test("commits with Enter and cancels with Escape", () => {
    let commitCount = 0;
    let cancelCount = 0;
    let changedValue = "";
    const widget = createWidget({
      draftValue: "Draft",
      editing: true,
      onCancel: () => {
        cancelCount += 1;
      },
      onChange: (nextValue) => {
        changedValue = nextValue;
      },
      onCommit: () => {
        commitCount += 1;
      },
      value: "Value",
    });
    const input = widget.inputElement as unknown as FakeElement & HTMLInputElement;

    input.value = "Edited";
    input.dispatchEvent({ type: "input" });
    input.dispatchEvent(createKeyboardEvent("keydown", "Enter"));

    assert.equal(changedValue, "Edited");
    assert.equal(commitCount, 1);
    assert.equal(cancelCount, 0);

    widget.update(createWidgetOptions({
      draftValue: "Another",
      editing: true,
      onCancel: () => {
        cancelCount += 1;
      },
      onCommit: () => {
        commitCount += 1;
      },
      value: "Value",
    }));
    input.dispatchEvent(createKeyboardEvent("keydown", "Escape"));

    assert.equal(commitCount, 1);
    assert.equal(cancelCount, 1);
    widget.dispose();
  });

  test("starts editing on double-click only while displaying", () => {
    let startEditCount = 0;
    const widget = createWidget({
      editing: false,
      onStartEdit: () => {
        startEditCount += 1;
      },
      value: "Value",
    });
    const input = widget.inputElement as unknown as FakeElement & HTMLInputElement;

    input.dispatchEvent({ type: "dblclick" });
    assert.equal(startEditCount, 1);

    widget.update(createWidgetOptions({
      editing: true,
      onStartEdit: () => {
        startEditCount += 1;
      },
      value: "Value",
    }));
    input.dispatchEvent({ type: "dblclick" });

    assert.equal(startEditCount, 1);
    widget.dispose();
  });

  test("does not commit or cancel while displaying", () => {
    let commitCount = 0;
    let cancelCount = 0;
    const widget = createWidget({
      editing: false,
      onCancel: () => {
        cancelCount += 1;
      },
      onCommit: () => {
        commitCount += 1;
      },
      value: "Value",
    });
    const input = widget.inputElement as unknown as FakeElement & HTMLInputElement;

    input.dispatchEvent(createKeyboardEvent("keydown", "Enter"));
    input.blur();
    input.dispatchEvent(createKeyboardEvent("keydown", "Escape"));

    assert.equal(commitCount, 0);
    assert.equal(cancelCount, 0);
    widget.dispose();
  });

  test("disposes input listeners", () => {
    const widget = createWidget({
      editing: true,
      value: "Value",
    });
    const input = widget.inputElement as unknown as FakeElement & HTMLInputElement;

    assert.ok(input.listenerCount > 0);
    widget.dispose();

    assert.equal(input.listenerCount, 0);
  });
});

const createWidget = (
  options: Partial<ConstructorParameters<typeof InlineEditableTextWidget>[0]>,
): InlineEditableTextWidget => new InlineEditableTextWidget(createWidgetOptions(options));

const createWidgetOptions = (
  options: Partial<ConstructorParameters<typeof InlineEditableTextWidget>[0]>,
): ConstructorParameters<typeof InlineEditableTextWidget>[0] => ({
  draftValue: options.draftValue ?? String(options.value ?? ""),
  editing: options.editing ?? false,
  onCancel: options.onCancel ?? (() => undefined),
  onChange: options.onChange ?? (() => undefined),
  onCommit: options.onCommit ?? (() => undefined),
  onStartEdit: options.onStartEdit ?? (() => undefined),
  value: options.value ?? "",
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

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly style = {
    removeAttribute: (_name: string) => undefined,
  };
  className = "";
  focusCount = 0;
  isConnected = true;
  parentElement: FakeElement | null = null;
  readOnly = false;
  selectCount = 0;
  type = "";
  value = "";

  public constructor(readonly tagName: string) {}

  public get listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  appendChild(node: FakeElement): FakeElement {
    node.parentElement = this;
    node.isConnected = this.isConnected;
    this.children.push(node);
    return node;
  }

  remove(): void {
    this.parentElement = null;
    this.isConnected = false;
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
}

const createFakeDocument = () => ({
  createElement: (tagName: string) => new FakeElement(tagName.toUpperCase()) as unknown as HTMLElement,
});
