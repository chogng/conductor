import { append } from "src/cs/base/browser/dom";
import { MenuScrollArea } from "src/cs/base/browser/ui/menuScrollArea/menuScrollArea";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/menu/menu.css";

export type MenuOptions = {
    className?: string;
    role?: string;
    withScrollArea?: boolean;
};

export class Menu {
    private readonly element: HTMLDivElement;
    private readonly content: HTMLElement;

    constructor(options: MenuOptions = {}) {
        this.element = document.createElement("div");
        this.element.role = options.role ?? "menu";
        this.element.className = cx("ui-menu", options.className);

        if (options.withScrollArea === false) {
            this.content = this.element;
        }
        else {
            const scrollArea = new MenuScrollArea();
            this.content = scrollArea.contentNode;
            this.element.appendChild(scrollArea.domNode);
        }
    }

    public get domNode(): HTMLDivElement {
        return this.element;
    }

    public append(...children: Array<Node | string>): void {
        append(this.content, ...children);
    }
}

export function createMenu(options?: MenuOptions): Menu {
    return new Menu(options);
}

export default Menu;
