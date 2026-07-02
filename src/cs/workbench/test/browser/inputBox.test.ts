import assert from "assert";

import {
  createInputBox,
  MessageType,
} from "src/cs/base/browser/ui/inputbox/inputBox";
import { InputBoxWidget } from "src/cs/base/browser/ui/inputbox/inputBoxWidget";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/test/browser/inputBox", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("createInputBox creates a styled input with defaults", () => {
    const inputBox = createInputBox({
      ariaLabel: "X value",
      placeholder: "0",
      value: "1",
    });

    assert.equal(inputBox.element.className, "inputbox_wrap idle");
    assert.equal(inputBox.field.className, "inputbox_field");
    assert.equal(inputBox.input.type, "text");
    assert.equal(inputBox.input.value, "1");
    assert.equal(inputBox.input.placeholder, "0");
    assert.equal(inputBox.input.disabled, false);
    assert.equal(inputBox.input.readOnly, false);
    assert.equal(inputBox.input.getAttribute("autocomplete"), "off");
    assert.equal(inputBox.input.getAttribute("aria-invalid"), "false");
    assert.equal(inputBox.input.getAttribute("aria-label"), "X value");
    assert.equal(inputBox.input.className, "inputbox_native");
    inputBox.dispose();
  });

  test("InputBoxWidget does not create native tooltips", () => {
    const inputBox = new InputBoxWidget({
      ariaLabel: "Match term",
      items: [
        {
          id: "custom-term",
          label: "Custom Term",
          removable: true,
          removeAriaLabel: "Remove match term Custom Term",
        },
      ],
      placeholder: "Add match term",
    });

    const item = inputBox.field.children[0];
    const action = item.children[1];

    assert.equal(inputBox.input.placeholder, "Add match term");
    assert.equal(inputBox.input.getAttribute("title"), null);
    assert.equal(item.getAttribute("title"), null);
    assert.equal(action.getAttribute("title"), null);

    inputBox.update({ placeholder: "Next match term" });

    assert.equal(inputBox.input.placeholder, "Next match term");
    assert.equal(inputBox.input.getAttribute("title"), null);
    inputBox.dispose();
  });

  test("createInputBox renders left and right slots around the native input", () => {
    const left = document.createElement("span");
    const right = document.createElement("button");
    const inputBox = createInputBox({ left, right });

    assert.equal(inputBox.field.children.length, 3);
    assert.equal(inputBox.field.children[0].className, "inputbox_left");
    assert.equal(inputBox.field.children[1], inputBox.input);
    assert.equal(inputBox.field.children[2].className, "inputbox_right");
    inputBox.dispose();
  });

  test("update synchronizes native input options", () => {
    const inputBox = createInputBox({
      type: "number",
      value: "2.5",
    });
    const input = inputBox.input as HTMLInputElement & FakeElement;
    const valueWriteCount = input.valueWriteCount;

    inputBox.update({
      disabled: true,
      readOnly: true,
      value: "2.5",
    });
    inputBox.showMessage({ type: MessageType.ERROR });

    assert.equal(input.valueWriteCount, valueWriteCount);
    assert.equal(input.type, "number");
    assert.equal(input.disabled, true);
    assert.equal(input.readOnly, true);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(input.className, "inputbox_native");
    assert.equal(inputBox.element.className, "inputbox_wrap error");

    inputBox.update({
      disabled: false,
      type: "text",
      value: "3.5",
    });

    assert.equal(inputBox.element.className, "inputbox_wrap error");
    assert.equal(input.type, "text");
    assert.equal(input.value, "3.5");
    assert.equal(input.disabled, false);
    assert.equal(input.getAttribute("aria-invalid"), "true");

    inputBox.hideMessage();
    assert.equal(inputBox.element.className, "inputbox_wrap idle");
    assert.equal(input.getAttribute("aria-invalid"), "false");
    inputBox.dispose();
  });

  test("focus blur select and value operate on the native input", () => {
    const inputBox = createInputBox({ value: "alpha" });
    const input = inputBox.input as HTMLInputElement & FakeElement;

    inputBox.focus();
    inputBox.select({ start: 1, end: 3 });
    inputBox.blur();
    inputBox.value = "beta";

    assert.equal(input.focusCount, 1);
    assert.equal(input.selectCount, 1);
    assert.equal(input.selectionStart, 1);
    assert.equal(input.selectionEnd, 3);
    assert.equal(input.blurCount, 1);
    assert.equal(inputBox.value, "beta");
    inputBox.dispose();
  });

  test("fires change focus and blur events from owned DOM listeners", () => {
    const store = new DisposableStore();
    const inputBox = createInputBox({ value: "alpha" });
    let changedValue = "";
    let focusCount = 0;
    let blurCount = 0;
    store.add(inputBox.onDidChange(value => {
      changedValue = value;
    }));
    store.add(inputBox.onDidFocus(() => {
      focusCount += 1;
    }));
    store.add(inputBox.onDidBlur(() => {
      blurCount += 1;
    }));

    inputBox.input.value = "beta";
    (inputBox.input as HTMLInputElement & FakeElement).dispatchEvent({ type: "input" });
    (inputBox.input as HTMLInputElement & FakeElement).dispatchEvent({ type: "focus" });
    (inputBox.input as HTMLInputElement & FakeElement).dispatchEvent({ type: "blur" });

    assert.equal(changedValue, "beta");
    assert.equal(focusCount, 1);
    assert.equal(blurCount, 1);
    store.dispose();
    inputBox.dispose();
  });

  test("showMessage uses upstream message type classes", () => {
    const inputBox = createInputBox();

    assert.equal(MessageType.INFO, 1);
    assert.equal(MessageType.WARNING, 2);
    assert.equal(MessageType.ERROR, 3);

    inputBox.showMessage({ type: MessageType.INFO });
    assert.equal(inputBox.element.className, "inputbox_wrap info");
    assert.equal(inputBox.input.getAttribute("aria-invalid"), "false");

    inputBox.showMessage({ type: MessageType.WARNING });
    assert.equal(inputBox.element.className, "inputbox_wrap warning");
    assert.equal(inputBox.input.getAttribute("aria-invalid"), "false");

    inputBox.showMessage({ type: MessageType.ERROR });
    assert.equal(inputBox.element.className, "inputbox_wrap error");
    assert.equal(inputBox.input.getAttribute("aria-invalid"), "true");

    inputBox.hideMessage();
    assert.equal(inputBox.element.className, "inputbox_wrap idle");
    assert.equal(inputBox.input.getAttribute("aria-invalid"), "false");
    inputBox.dispose();
  });

  test("showMessage announces message content through aria alert", () => {
    const inputBox = createInputBox();

    inputBox.showMessage({ content: "Invalid value", type: MessageType.ERROR });

    const alert = (document.body as unknown as FakeElement).children
      .flatMap(child => child.children)
      .find(child => child.getAttribute("role") === "alert" && child.textContent === "Error: Invalid value");
    assert.ok(alert);
    inputBox.dispose();
  });
});

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly classList = {
    add: (...names: string[]) => {
      const classNames = new Set(this.className.split(/\s+/).filter(Boolean));
      for (const name of names) {
        classNames.add(name);
      }
      this.className = Array.from(classNames).join(" ");
    },
    remove: (...names: string[]) => {
      const removed = new Set(names);
      this.className = this.className
        .split(/\s+/)
        .filter(name => name && !removed.has(name))
        .join(" ");
    },
    toggle: (name: string, force?: boolean) => {
      const classNames = new Set(this.className.split(/\s+/).filter(Boolean));
      const shouldAdd = force ?? !classNames.has(name);
      if (shouldAdd) {
        classNames.add(name);
      } else {
        classNames.delete(name);
      }
      this.className = Array.from(classNames).join(" ");
      return shouldAdd;
    },
  };
  blurCount = 0;
  className = "";
  disabled = false;
  focusCount = 0;
  id = "";
  name = "";
  placeholder = "";
  readOnly = false;
  selectCount = 0;
  selectionEnd = 0;
  selectionStart = 0;
  type = "";
  valueWriteCount = 0;
  tagName = "";
  textContent = "";
  style: Record<string, string> = {};
  private currentValue = "";

  get title(): string {
    return this.attributes.get("title") ?? "";
  }

  set title(value: string) {
    if (value) {
      this.attributes.set("title", value);
      return;
    }
    this.attributes.delete("title");
  }

  get value(): string {
    return this.currentValue;
  }

  set value(value: string) {
    this.valueWriteCount += 1;
    this.currentValue = value;
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  appendChild(node: FakeElement): FakeElement {
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  insertBefore(node: FakeElement, child: FakeElement): FakeElement {
    const index = this.children.indexOf(child);
    if (index === -1) {
      this.children.push(node);
      return node;
    }
    this.children.splice(index, 0, node);
    return node;
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

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  remove(): void {
    // Test fake DOM does not maintain parent links.
  }

  focus(): void {
    this.focusCount += 1;
  }

  blur(): void {
    this.blurCount += 1;
  }

  select(): void {
    this.selectCount += 1;
  }

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

const createFakeDocument = () => ({
  body: createFakeElement("body"),
  createElement: (tagName: string) => {
    return createFakeElement(tagName) as unknown as HTMLElement;
  },
});

const createFakeElement = (tagName: string): FakeElement => {
  const element = new FakeElement();
  element.tagName = tagName.toUpperCase();
  return element;
};
