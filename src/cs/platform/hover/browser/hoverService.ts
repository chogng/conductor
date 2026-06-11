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
import { ManagedHoverWidget } from "src/cs/platform/hover/browser/updatableHoverWidget";

const ManagedHoverDelay = 700;

export const IHoverService = createDecorator<IHoverService>("hoverService");

export interface IHoverService extends IHoverDelegate {
  readonly _serviceBrand: undefined;
}

class ManagedHover extends Disposable implements IManagedHover {
  private readonly listeners = this._register(new DisposableStore());
  private readonly hoverWidget: ManagedHoverWidget;
  private showTimer = 0;
  private suppressUntil = 0;
  private visible = false;
  private content: IManagedHoverContentOrFactory;

  constructor(
    private readonly target: HTMLElement,
    content: IManagedHoverContentOrFactory,
    private readonly options: IManagedHoverOptions = {},
    private readonly onDispose?: () => void,
  ) {
    super();
    this.content = content;
    this.hoverWidget = this._register(new ManagedHoverWidget(target));
    this.listeners.add(addDisposableListener(target, EventType.MOUSE_ENTER, () => this.schedule()));
    this.listeners.add(addDisposableListener(target, EventType.FOCUS, () => this.schedule()));
    this.listeners.add(addDisposableListener(target, EventType.MOUSE_LEAVE, () => this.hide()));
    this.listeners.add(addDisposableListener(target, EventType.BLUR, () => this.hide()));
    this.listeners.add(addDisposableListener(target, EventType.POINTER_DOWN, () => this.suppress()));
    this.listeners.add(addDisposableListener(target, EventType.KEY_DOWN, event => {
      if (event.key === "Enter" || event.key === " ") {
        this.suppress();
        return;
      }
      if (event.key === "Escape") {
        this.hide();
      }
    }));
  }

  public show(): void {
    this.clearTimer();
    if (Date.now() < this.suppressUntil) {
      return;
    }

    const content = this.resolveContent();
    if (!content) {
      this.hide();
      return;
    }

    this.hoverWidget.show(content);
    this.visible = true;
  }

  public hide(): void {
    this.clearTimer();
    this.visible = false;
    this.hoverWidget.hide();
  }

  public update(content: IManagedHoverContent, _options?: IManagedHoverOptions): void {
    this.content = content;
    const resolved = this.resolveContent();
    if (!resolved) {
      this.hide();
      return;
    }
    if (this.visible) {
      this.hoverWidget.show(resolved);
    }
  }

  public override dispose(): void {
    this.onDispose?.();
    this.hide();
    super.dispose();
  }

  private schedule(): void {
    this.clearTimer();
    this.showTimer = this.target.ownerDocument.defaultView?.setTimeout(() => this.show(), this.options.delay ?? ManagedHoverDelay) ?? 0;
  }

  private suppress(): void {
    const duration = this.options.suppressOnPointerDown;
    if (duration === undefined) {
      this.hide();
      return;
    }

    this.suppressUntil = Date.now() + duration;
    this.hide();
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
    options?: IManagedHoverOptions,
  ): IManagedHover {
    const hover = new ManagedHover(
      target,
      content,
      options,
      () => this.managedHovers.delete(hover),
    );
    return this.managedHovers.add(hover);
  }
}

registerSingleton(IHoverService, BrowserHoverService, InstantiationType.Delayed);
