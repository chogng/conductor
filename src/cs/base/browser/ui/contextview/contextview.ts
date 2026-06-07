import { addDisposableListener, getClientArea, getContentWidth, getDomRect, getElementSize, reset } from "src/cs/base/browser/dom";
import { anchoredLayout, rectFromDomRect } from "src/cs/base/common/layout";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/contextview/contextview.css";

export type ContextViewAlign = "left" | "center" | "right";
export type ContextViewSide = "bottom" | "right";
type ResolvedContextViewSide = "top" | "bottom" | "right" | "left";

export type ContextViewProvider = {
    showContextView(delegate: ContextViewDelegate, container?: HTMLElement): ContextViewHandle;
    hideContextView(data?: unknown): void;
    layout(): void;
};

export type ContextViewHandle = {
    close(): void;
};

export type ContextViewDelegate = {
    canRelayout?: boolean;
    getAnchor(): HTMLElement;
    render(container: HTMLElement): IDisposable | null;
    focus?(): void;
    onHide?(data?: unknown): void;
};

export type ContextViewOptions = {
    align?: ContextViewAlign;
    anchor: HTMLElement;
    ariaOrientation?: "vertical" | "horizontal";
    className?: string;
    contextViewProvider?: ContextViewProvider;
    host?: HTMLElement;
    matchAnchorWidth?: boolean;
    menuId?: string;
    render: (container: HTMLElement) => void;
    role?: string;
    side?: ContextViewSide;
    triggerId?: string;
    zIndex?: number;
};

const CONTEXT_VIEW_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;

export class ContextView implements IDisposable {
    private readonly disposables = new DisposableStore();
    private readonly element: HTMLDivElement;
    private readonly host: HTMLElement;
    private options: ContextViewOptions;
    private providerHandle: ContextViewHandle | undefined;
    private isOpen = false;
    private side: ResolvedContextViewSide = "bottom";

    constructor(options: ContextViewOptions) {
        this.options = options;
        this.host = options.host ?? document.body;

        this.element = document.createElement("div");
        this.element.tabIndex = -1;
        this.applyOptions();
    }

    public get domNode(): HTMLDivElement {
        return this.element;
    }

    public show(): void {
        if (this.isOpen) {
            this.layout();
            return;
        }

        this.isOpen = true;
        const provider = this.options.contextViewProvider;
        if (provider) {
            this.providerHandle = provider.showContextView({
                canRelayout: true,
                getAnchor: () => this.options.anchor,
                render: container => {
                    container.appendChild(this.element);
                    this.render();
                    this.applyState();
                    this.layout();
                    return { dispose: () => this.element.remove() };
                },
                onHide: () => {
                    this.isOpen = false;
                    this.providerHandle = undefined;
                    this.applyState();
                },
            }, this.host);
            return;
        }

        this.host.appendChild(this.element);
        this.render();
        this.applyState();
        this.layout();
        this.disposables.add(addDisposableListener(window, "resize", this.layout));
        this.disposables.add(addDisposableListener(window, "scroll", this.layout, true));
    }

    public hide(): void {
        if (!this.isOpen) {
            return;
        }

        this.isOpen = false;
        this.disposables.clear();
        if (this.providerHandle) {
            const handle = this.providerHandle;
            this.providerHandle = undefined;
            handle.close();
        }
        this.applyState();
        this.element.remove();
    }

    public update(options: Partial<ContextViewOptions>): void {
        this.options = { ...this.options, ...options };
        this.applyOptions();

        if (this.isOpen) {
            if (this.options.contextViewProvider) {
                this.options.contextViewProvider.layout();
            }
            this.render();
            this.layout();
        }
    }

    public dispose(): void {
        this.hide();
        reset(this.element);
    }

    public readonly layout = (): void => {
        if (!this.isOpen) {
            return;
        }

        this.element.style.removeProperty("width");
        this.element.style.removeProperty("max-width");
        this.element.style.removeProperty("min-width");

        const anchorRect = rectFromDomRect(getDomRect(this.options.anchor));
        const anchorWidth = Math.max(0, anchorRect.width);
        const viewportDimension = getClientArea(window);
        const maxWidth = Math.max(0, viewportDimension.width - VIEWPORT_PADDING_PX * 2);
        const contextViewSize = getElementSize(this.element);
        const contentWidth = Math.max(
            getContentWidth(this.element) || 0,
            this.element.scrollWidth || 0,
            this.element.offsetWidth || 0,
        );
        const contextViewWidth = this.options.matchAnchorWidth
            ? Math.min(Math.max(contentWidth, anchorWidth), maxWidth)
            : Math.min(contentWidth, maxWidth);

        const layout = anchoredLayout({
            viewport: {
                top: 0,
                left: 0,
                width: viewportDimension.width,
                height: viewportDimension.height,
            },
            anchor: anchorRect,
            view: {
                width: contextViewWidth,
                height: contextViewSize.height,
            },
            gap: CONTEXT_VIEW_GAP_PX,
            padding: VIEWPORT_PADDING_PX,
            align: this.options.align ?? "left",
            side: this.options.side ?? "bottom",
        });

        this.side = layout.side;
        if (this.options.contextViewProvider) {
            this.element.style.position = "static";
            this.element.style.removeProperty("top");
            this.element.style.removeProperty("left");
            this.applySize(layout.width, layout.maxWidth, anchorWidth);
            this.element.style.zIndex = String(this.options.zIndex ?? 20);
            this.element.dataset.side = this.side;
            return;
        }

        this.element.style.position = "fixed";
        this.element.style.top = `${layout.top}px`;
        this.element.style.left = `${layout.left}px`;
        this.applySize(layout.width, layout.maxWidth, anchorWidth);
        this.element.style.zIndex = String(this.options.zIndex ?? 20);

        this.element.dataset.side = this.side;
    };

    private applySize(width: number, maxWidth: number, anchorWidth: number): void {
        this.element.style.width = this.options.matchAnchorWidth || width >= maxWidth
            ? `${width}px`
            : "initial";
        this.element.style.maxWidth = `${maxWidth}px`;

        if (this.options.matchAnchorWidth) {
            this.element.style.minWidth = `${Math.min(anchorWidth, maxWidth)}px`;
        }
        else {
            this.element.style.removeProperty("min-width");
        }
    }

    private applyOptions(): void {
        const { align = "left", ariaOrientation = "vertical", menuId, role = "menu", triggerId } = this.options;

        this.element.id = menuId ?? "";
        this.element.setAttribute("role", role);
        this.element.setAttribute("aria-orientation", ariaOrientation);
        this.element.dataset.align = align;

        if (triggerId) {
            this.element.setAttribute("aria-labelledby", triggerId);
        }
        else {
            this.element.removeAttribute("aria-labelledby");
        }

        const classNames = ["context-view"];
        if (this.options.className) {
            classNames.push(this.options.className);
        }
        this.element.className = classNames.join(" ");
        this.applyState();
    }

    private applyState(): void {
        this.element.dataset.state = this.isOpen ? "open" : "closed";
        this.element.setAttribute("aria-hidden", this.isOpen ? "false" : "true");
        this.element.classList.toggle("context-view--open", this.isOpen);
        this.element.classList.toggle("context-view--closed", !this.isOpen);
    }

    private render(): void {
        reset(this.element);
        this.options.render(this.element);
    }
}

export default ContextView;
