import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import {
  type IManagedHoverContent,
  type IManagedHoverContentOrFactory,
  type IManagedHoverOptions,
  type IManagedHover,
} from "src/cs/base/browser/ui/hover/hover";
import type { IHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { Disposable, DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { HoverWidget } from "src/cs/platform/hover/browser/hoverWidget";

export const IHoverService = createDecorator<IHoverService>("hoverService");

export interface IHoverService extends IHoverDelegate {
  readonly _serviceBrand: undefined;
}

class ManagedHover extends Disposable implements IManagedHover {
  private readonly listeners = this._register(new DisposableStore());
  private hoverWidget: HoverWidget | undefined;
  private showTimer = 0;
  private content: IManagedHoverContentOrFactory;

  constructor(
    private readonly target: HTMLElement,
    content: IManagedHoverContentOrFactory,
  ) {
    super();
    this.content = content;
    this.listeners.add(addDisposableListener(target, EventType.MOUSE_ENTER, () => this.schedule()));
    this.listeners.add(addDisposableListener(target, EventType.FOCUS, () => this.schedule()));
    this.listeners.add(addDisposableListener(target, EventType.MOUSE_LEAVE, () => this.hide()));
    this.listeners.add(addDisposableListener(target, EventType.BLUR, () => this.hide()));
    this.listeners.add(addDisposableListener(target, EventType.KEY_DOWN, event => {
      if (event.key === "Escape") {
        this.hide();
      }
    }));
  }

  public show(): void {
    this.clearTimer();
    const content = this.resolveContent();
    if (!content) {
      return;
    }

    const ownerDocument = this.target.ownerDocument;
    const widget = this.hoverWidget ?? new HoverWidget(ownerDocument, content);
    if (!this.hoverWidget) {
      ownerDocument.body.appendChild(widget.element);
      this.hoverWidget = widget;
    } else {
      widget.update(content);
    }

    widget.layout(this.target);
  }

  public hide(): void {
    this.clearTimer();
    this.hoverWidget?.dispose();
    this.hoverWidget = undefined;
  }

  public update(content: IManagedHoverContent, _options?: IManagedHoverOptions): void {
    this.content = content;
    if (this.hoverWidget) {
      const resolved = this.resolveContent();
      if (!resolved) {
        this.hide();
        return;
      }
      this.hoverWidget.update(resolved);
      this.hoverWidget.layout(this.target);
    }
  }

  public override dispose(): void {
    this.hide();
    super.dispose();
  }

  private schedule(): void {
    this.clearTimer();
    this.showTimer = this.target.ownerDocument.defaultView?.setTimeout(() => this.show(), 300) ?? 0;
  }

  private clearTimer(): void {
    if (!this.showTimer) {
      return;
    }
    this.target.ownerDocument.defaultView?.clearTimeout(this.showTimer);
    this.showTimer = 0;
  }

  private resolveContent(): IManagedHoverContent {
    return typeof this.content === "function" ? this.content() : this.content;
  }

}

class BrowserHoverService extends Disposable implements IHoverService {
  public declare readonly _serviceBrand: undefined;
  private readonly managedHovers = this._register(new DisposableStore());

  public setupManagedHover(
    target: HTMLElement,
    content: IManagedHoverContentOrFactory,
    _options?: IManagedHoverOptions,
  ): IManagedHover {
    return this.managedHovers.add(new ManagedHover(target, content));
  }
}

registerSingleton(IHoverService, BrowserHoverService, InstantiationType.Delayed);
