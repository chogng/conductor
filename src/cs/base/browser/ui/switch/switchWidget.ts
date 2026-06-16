import { addDisposableListener } from "src/cs/base/browser/dom";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";

import { createSwitch, updateSwitch, type SwitchOptions } from "./switch";

const SWITCH_ANIMATE_CLASS = "ui-switch--animate";
const SWITCH_ANIMATION_TIMEOUT_MS = 260;

export type SwitchWidgetOptions = SwitchOptions & {
  readonly onDidChangeChecked?: (checked: boolean) => void;
};

export class SwitchWidget extends Disposable {
  public readonly domNode: HTMLButtonElement;

  private readonly onDidChangeCheckedEmitter = this._register(new Emitter<boolean>());
  public readonly onDidChangeChecked: Event<boolean> = this.onDidChangeCheckedEmitter.event;

  private options: SwitchOptions;
  private animationTimeout: number | null = null;

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

    this._register({
      dispose: () => this.clearAnimationTimeout(),
    });
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
    this.enableInteractionAnimation();
    this.update({ checked });
    this.onDidChangeCheckedEmitter.fire(checked);
  }

  private enableInteractionAnimation(): void {
    this.clearAnimationTimeout();
    this.domNode.classList.add(SWITCH_ANIMATE_CLASS);
    const targetWindow = this.domNode.ownerDocument.defaultView ?? window;
    this.animationTimeout = targetWindow.setTimeout(() => {
      this.animationTimeout = null;
      this.domNode.classList.remove(SWITCH_ANIMATE_CLASS);
    }, SWITCH_ANIMATION_TIMEOUT_MS);
  }

  private clearAnimationTimeout(): void {
    if (this.animationTimeout === null) {
      return;
    }

    const targetWindow = this.domNode.ownerDocument.defaultView ?? window;
    targetWindow.clearTimeout(this.animationTimeout);
    this.animationTimeout = null;
    this.domNode.classList.remove(SWITCH_ANIMATE_CLASS);
  }
}
