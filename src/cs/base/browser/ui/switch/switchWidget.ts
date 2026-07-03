import { addDisposableListener } from "src/cs/base/browser/dom";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";

import { createSwitch, updateSwitch, type SwitchOptions } from "./switch";

export type SwitchWidgetOptions = SwitchOptions & {
  readonly onDidChangeChecked?: (checked: boolean) => void;
};

export class SwitchWidget extends Disposable {
  public readonly domNode: HTMLButtonElement;

  private readonly onDidChangeCheckedEmitter = this._register(new Emitter<boolean>());
  public readonly onDidChangeChecked: Event<boolean> = this.onDidChangeCheckedEmitter.event;

  private options: SwitchOptions;

  constructor(options: SwitchWidgetOptions = {}) {
    super();

    const { onDidChangeChecked, ...switchOptions } = options;
    this.options = {
      ...switchOptions,
      checked: switchOptions.checked === true,
    };
    this.domNode = createSwitch(this.options);
    this._register(addDisposableListener(this.domNode, "click", () => this.toggle()));

    if (onDidChangeChecked) {
      this._register(this.onDidChangeChecked(onDidChangeChecked));
    }
  }

  public get checked(): boolean {
    return this.options.checked === true;
  }

  public update(options: SwitchOptions = {}): void {
    this.options = {
      ...this.options,
      ...options,
    };
    updateSwitch(this.domNode, this.options);
  }

  private toggle(): void {
    if (this.domNode.disabled) {
      return;
    }

    const checked = !this.checked;
    this.update({ checked });
    // Commit the visual state before synchronous listeners update surrounding UI.
    void this.domNode.offsetWidth;
    this.onDidChangeCheckedEmitter.fire(checked);
  }
}
