import assert from "assert";

import {
  createInputBox,
  updateInputBox,
} from "src/cs/base/browser/ui/inputbox/inputBox";
import {
  createInputBoxField,
} from "src/cs/base/browser/ui/inputbox/inputBoxField";

suite("workbench/test/browser/inputBoxField", () => {
  const originalDocument = globalThis.document;

  setup(() => {
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  teardown(() => {
    globalThis.document = originalDocument;
  });

  test("createInputBox creates a bare reusable input primitive", () => {
    const input = createInputBox({
      ariaLabel: "Inline name",
      inputClassName: "inline-name",
      value: "alpha",
    });

    assert.equal(input.type, "text");
    assert.equal(input.value, "alpha");
    assert.equal(input.getAttribute("autocomplete"), "off");
    assert.equal(input.getAttribute("aria-label"), "Inline name");
    assert.equal(input.className, "inline-name");
    assert.equal(input.className.includes("inputbox_native"), false);

    updateInputBox(input, {
      inputClassName: "inline-name editing",
      readOnly: true,
      value: "beta",
    });

    assert.equal(input.value, "beta");
    assert.equal(input.readOnly, true);
    assert.equal(input.className, "inline-name editing");
  });

  test("createInputBoxField creates a styled input with defaults", () => {
    const field = createInputBoxField({
      ariaLabel: "X value",
      placeholder: "0",
      value: "1",
    });

    assert.equal(field.input.type, "text");
    assert.equal(field.input.value, "1");
    assert.equal(field.input.placeholder, "0");
    assert.equal(field.input.disabled, false);
    assert.equal(field.input.readOnly, false);
    assert.equal(field.input.getAttribute("autocomplete"), "off");
    assert.equal(field.input.getAttribute("aria-invalid"), "false");
    assert.equal(field.input.getAttribute("aria-label"), "X value");
    assert.ok(field.input.className.includes("inputbox_native"));
  });

  test("createInputBoxField preserves existing input state unless options explicitly update it", () => {
    const input = document.createElement("input") as unknown as FakeElement & HTMLInputElement;
    input.type = "number";
    input.value = "2.5";
    input.disabled = true;
    input.placeholder = "line width";
    input.setAttribute("autocomplete", "on");
    input.setAttribute("aria-invalid", "true");
    const valueWriteCount = input.valueWriteCount;

    const field = createInputBoxField({
      input,
      inputClassName: "extra-input",
      value: "2.5",
    });

    assert.equal(field.input, input);
    assert.equal(input.valueWriteCount, valueWriteCount);
    assert.equal(field.field.dataset.state, "disabled");
    assert.equal(input.type, "number");
    assert.equal(input.value, "2.5");
    assert.equal(input.disabled, true);
    assert.equal(input.placeholder, "line width");
    assert.equal(input.getAttribute("autocomplete"), "on");
    assert.ok(input.className.includes("inputbox_native"));
    assert.ok(input.className.includes("extra-input"));

    const updatedField = createInputBoxField({
      disabled: false,
      error: false,
      input,
      type: "text",
      value: "3.5",
    });

    assert.equal(updatedField.field.dataset.state, "enable");
    assert.equal(input.type, "text");
    assert.equal(input.value, "3.5");
    assert.equal(input.disabled, false);
    assert.equal(input.getAttribute("aria-invalid"), "false");
  });
});

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = "";
  disabled = false;
  id = "";
  name = "";
  placeholder = "";
  readOnly = false;
  type = "";
  valueWriteCount = 0;
  private currentValue = "";

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
  createElement: () => new FakeElement() as unknown as HTMLElement,
});
