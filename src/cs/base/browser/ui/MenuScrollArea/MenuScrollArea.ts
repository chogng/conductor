import { append } from "src/cs/base/browser/dom";
import { cx } from "src/utils/cx";

export type MenuScrollAreaOptions = {
    className?: string;
    viewportClassName?: string;
};

export class MenuScrollArea {
    private readonly element: HTMLDivElement;
    private readonly viewport: HTMLDivElement;

    constructor(options: MenuScrollAreaOptions = {}) {
        this.element = document.createElement("div");
        this.element.className = cx("ui-menu__scroll-area max-h-60 -mr-1 pr-1", options.className);

        this.viewport = document.createElement("div");
        this.viewport.className = cx("max-h-60", options.viewportClassName);
        this.viewport.style.height = "auto";
        this.viewport.style.maxHeight = "15rem";
        this.viewport.style.overflowY = "auto";

        this.element.appendChild(this.viewport);
    }

    public get domNode(): HTMLDivElement {
        return this.element;
    }

    public get contentNode(): HTMLDivElement {
        return this.viewport;
    }

    public append(...children: Array<Node | string>): void {
        append(this.viewport, ...children);
    }
}

export function createMenuScrollArea(options?: MenuScrollAreaOptions): MenuScrollArea {
    return new MenuScrollArea(options);
}

export default MenuScrollArea;
