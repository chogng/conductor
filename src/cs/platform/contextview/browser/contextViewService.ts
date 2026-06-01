import { addDisposableListener, getClientArea, getDomRect, getElementSize, reset } from "src/cs/base/browser/dom";
import { AnchorAlignment, AnchorAxisAlignment, AnchorPosition, layout2d, rectFromDomRect, type IRect } from "src/cs/base/common/layout";
import { Disposable, DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
    IContextViewService,
    type IAnchor,
    type IContextViewDelegate,
    type IContextViewService as IContextViewServiceType,
    type IOpenContextView,
} from "src/cs/platform/contextview/browser/contextView";

import "src/cs/platform/contextview/browser/contextView.css";

export class ContextViewService extends Disposable implements IContextViewServiceType {
    public declare readonly _serviceBrand: undefined;

    private readonly element: HTMLDivElement;
    private readonly listeners = this._register(new DisposableStore());
    private activeDisposer: IDisposable = Disposable.None;
    private delegate: IContextViewDelegate | undefined;
    private container: HTMLElement | undefined;
    private openContextView: IOpenContextView | undefined;

    constructor() {
        super();
        this.element = document.createElement("div");
        this.element.className = "context-view fixed";
        this.element.style.display = "none";
        this.element.style.top = "0";
        this.element.style.left = "0";
        this.element.style.zIndex = "2575";
    }

    public showContextView(delegate: IContextViewDelegate, container: HTMLElement = document.body): IOpenContextView {
        this.hideContextView();

        this.delegate = delegate;
        this.container = container;
        this.element.style.display = "";
        this.element.style.zIndex = String(2575 + (delegate.layer ?? 0));
        reset(this.element);

        if (!this.element.parentElement) {
            container.appendChild(this.element);
        }

        this.activeDisposer = delegate.render(this.element) ?? Disposable.None;
        this.layout();
        delegate.focus?.();
        this.installListeners();

        const openContextView: IOpenContextView = {
            close: () => {
                if (this.openContextView === openContextView) {
                    this.hideContextView();
                }
            },
        };
        this.openContextView = openContextView;
        return openContextView;
    }

    public hideContextView(data?: unknown): void {
        if (!this.delegate) {
            return;
        }

        const delegate = this.delegate;
        this.delegate = undefined;
        this.openContextView = undefined;
        this.activeDisposer.dispose();
        this.activeDisposer = Disposable.None;
        this.listeners.clear();
        reset(this.element);
        this.element.style.display = "none";
        this.element.remove();
        delegate.onHide?.(data);
    }

    public getContextViewElement(): HTMLElement {
        return this.element;
    }

    public layout(): void {
        if (!this.delegate || this.element.style.display === "none") {
            return;
        }

        const anchor = this.getAnchorRect(this.delegate.getAnchor());
        const viewportSize = getClientArea(window);
        const viewSize = getElementSize(this.element);
        const layout = layout2d({
            top: 0,
            left: 0,
            width: viewportSize.width,
            height: viewportSize.height,
        }, {
            width: viewSize.width,
            height: viewSize.height,
        }, anchor, {
            anchorAlignment: this.delegate.anchorAlignment ?? AnchorAlignment.LEFT,
            anchorAxisAlignment: this.delegate.anchorAxisAlignment ?? AnchorAxisAlignment.VERTICAL,
            anchorPosition: AnchorPosition.BELOW,
        });

        this.element.style.top = `${layout.top}px`;
        this.element.style.left = `${layout.left}px`;
    }

    public override dispose(): void {
        this.hideContextView();
        super.dispose();
    }

    private installListeners(): void {
        this.listeners.clear();

        if (this.delegate?.canRelayout !== false) {
            this.listeners.add(addDisposableListener(window, "resize", () => this.layout()));
            this.listeners.add(addDisposableListener(window, "scroll", () => this.layout(), true));
        }
    }

    private getAnchorRect(anchor: HTMLElement | IAnchor): IRect {
        if (anchor instanceof HTMLElement) {
            return rectFromDomRect(getDomRect(anchor));
        }

        return {
            top: anchor.y,
            left: anchor.x,
            width: anchor.width ?? 1,
            height: anchor.height ?? 1,
        };
    }
}

registerSingleton(IContextViewService, ContextViewService, InstantiationType.Delayed);
