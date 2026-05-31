import { addDisposableListener, append } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { cx } from "src/utils/cx";

export type MenuItemOptions = {
    className?: string;
    disabled?: boolean;
    left?: Node | string;
    onClick?: (event: MouseEvent | KeyboardEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    right?: Node | string;
    role?: string;
    selected?: boolean;
    tabIndex?: number;
    value?: string;
};

export class MenuItem implements IDisposable {
    private readonly disposables = new DisposableStore();
    private readonly element: HTMLDivElement;
    private options: MenuItemOptions;

    constructor(options: MenuItemOptions = {}) {
        this.options = options;
        this.element = document.createElement("div");
        this.applyOptions();
        this.render();

        this.disposables.add(addDisposableListener(this.element, "click", event => {
            if (this.options.disabled) {
                return;
            }

            this.options.onClick?.(event);
        }));
        this.disposables.add(addDisposableListener(this.element, "keydown", event => {
            if (this.options.disabled || event.defaultPrevented) {
                return;
            }

            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            this.options.onClick?.(event);
        }));
        this.disposables.add(addDisposableListener(this.element, "mouseenter", event => {
            if (!this.options.disabled) {
                this.options.onMouseEnter?.(event);
            }
        }));
    }

    public get domNode(): HTMLDivElement {
        return this.element;
    }

    public update(options: Partial<MenuItemOptions>): void {
        this.options = { ...this.options, ...options };
        this.applyOptions();
        this.render();
    }

    public dispose(): void {
        this.disposables.dispose();
        this.element.remove();
    }

    private applyOptions(): void {
        this.element.role = this.options.role ?? "menuitem";
        this.element.tabIndex = this.options.disabled ? -1 : this.options.tabIndex ?? -1;
        this.element.className = cx("ui-menu__item select-none outline-none", this.options.className);

        if (this.options.disabled) {
            this.element.setAttribute("aria-disabled", "true");
        }
        else {
            this.element.removeAttribute("aria-disabled");
        }

        if (this.options.selected) {
            this.element.dataset.selected = "true";
        }
        else {
            delete this.element.dataset.selected;
        }

        if (this.options.value !== undefined) {
            this.element.dataset.value = this.options.value;
        }
        else {
            delete this.element.dataset.value;
        }
    }

    private render(): void {
        this.element.replaceChildren();

        if (this.options.left !== undefined) {
            append(this.element, this.options.left);
        }

        if (this.options.right !== undefined) {
            append(this.element, this.options.right);
        }
    }
}

export function createMenuItem(options?: MenuItemOptions): MenuItem {
    return new MenuItem(options);
}

export default MenuItem;
