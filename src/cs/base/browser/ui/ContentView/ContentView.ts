import { addDisposableListener, getClientArea, getContentWidth, getDomRect, getElementSize, reset } from "src/cs/base/browser/dom";
import { anchoredLayout, rectFromDomRect } from "src/cs/base/common/layout";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/contentView/contentView.css";

export type ContentViewAlign = "left" | "center" | "right";
export type ContentViewSide = "bottom" | "right";
type ResolvedContentViewSide = "top" | "bottom" | "right" | "left";
type ContentViewVariant = "surface" | "menu";

export type ContentViewProvider = {
    showContextView(delegate: ContentViewDelegate, container?: HTMLElement): ContentViewHandle;
    hideContextView(data?: unknown): void;
    layout(): void;
};

export type ContentViewHandle = {
    close(): void;
};

export type ContentViewDelegate = {
    canRelayout?: boolean;
    getAnchor(): HTMLElement;
    render(container: HTMLElement): IDisposable | null;
    focus?(): void;
    onHide?(data?: unknown): void;
};

export type ContentViewOptions = {
    align?: ContentViewAlign;
    anchor: HTMLElement;
    ariaOrientation?: "vertical" | "horizontal";
    className?: string;
    contextViewProvider?: ContentViewProvider;
    host?: HTMLElement;
    matchAnchorWidth?: boolean;
    menuId?: string;
    render: (container: HTMLElement) => void;
    role?: string;
    side?: ContentViewSide;
    triggerId?: string;
    variant?: ContentViewVariant;
    zIndex?: number;
};

const CONTENT_VIEW_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;

export class ContentView implements IDisposable {
    private readonly disposables = new DisposableStore();
    private readonly element: HTMLDivElement;
    private readonly surface: HTMLDivElement;
    private readonly host: HTMLElement;
    private options: ContentViewOptions;
    private providerHandle: ContentViewHandle | undefined;
    private isOpen = false;
    private side: ResolvedContentViewSide = "bottom";

    constructor(options: ContentViewOptions) {
        this.options = options;
        this.host = options.host ?? document.body;

        this.element = document.createElement("div");
        this.element.tabIndex = -1;
        this.element.dataset.style = "contentview";

        this.surface = document.createElement("div");
        this.element.appendChild(this.surface);
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

    public update(options: Partial<ContentViewOptions>): void {
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
        reset(this.surface);
    }

    private readonly layout = (): void => {
        if (!this.isOpen) {
            return;
        }

        const anchorRect = rectFromDomRect(getDomRect(this.options.anchor));
        const anchorWidth = Math.max(0, anchorRect.width);
        const viewportDimension = getClientArea(window);
        const maxWidth = Math.max(0, viewportDimension.width - VIEWPORT_PADDING_PX * 2);
        const contentViewSize = getElementSize(this.element);
        const contentWidth = Math.max(
            getContentWidth(this.surface) || 0,
            this.element.scrollWidth || 0,
            this.element.offsetWidth || 0,
        );
        const contentViewWidth = this.options.matchAnchorWidth
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
                width: contentViewWidth,
                height: contentViewSize.height,
            },
            gap: CONTENT_VIEW_GAP_PX,
            padding: VIEWPORT_PADDING_PX,
            align: this.options.align ?? "left",
            side: this.options.side ?? "bottom",
        });

        this.side = layout.side;
        if (this.options.contextViewProvider) {
            this.element.style.position = "static";
            this.element.style.removeProperty("top");
            this.element.style.removeProperty("left");
            this.element.style.width = `${layout.width}px`;
            this.element.style.maxWidth = `${layout.maxWidth}px`;
            this.element.style.zIndex = String(this.options.zIndex ?? 20);
            if (this.options.matchAnchorWidth) {
                this.element.style.minWidth = `${Math.min(anchorWidth, maxWidth)}px`;
            }
            else {
                this.element.style.removeProperty("min-width");
            }
            this.element.dataset.side = this.side;
            return;
        }

        this.element.style.position = "fixed";
        this.element.style.top = `${layout.top}px`;
        this.element.style.left = `${layout.left}px`;
        this.element.style.width = `${layout.width}px`;
        this.element.style.maxWidth = `${layout.maxWidth}px`;
        this.element.style.zIndex = String(this.options.zIndex ?? 20);

        if (this.options.matchAnchorWidth) {
            this.element.style.minWidth = `${Math.min(anchorWidth, maxWidth)}px`;
        }
        else {
            this.element.style.removeProperty("min-width");
        }

        this.element.dataset.side = this.side;
    };

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

        const classNames = ["content-view__surface"];
        if (this.options.variant === "menu") {
            classNames.push("content-view__surface--menu");
        }
        if (this.options.className) {
            classNames.push(this.options.className);
        }
        this.surface.className = classNames.join(" ");
        this.applyState();
    }

    private applyState(): void {
        this.element.dataset.state = this.isOpen ? "open" : "closed";
        this.element.setAttribute("aria-hidden", this.isOpen ? "false" : "true");
        this.element.className = this.isOpen ? "content-view__portal--open" : "content-view__portal--closed";
        this.surface.classList.toggle("content-view__surface--open", this.isOpen);
        this.surface.classList.toggle("content-view__surface--closed", !this.isOpen);
    }

    private render(): void {
        reset(this.surface);
        this.options.render(this.surface);
    }
}

export default ContentView;
