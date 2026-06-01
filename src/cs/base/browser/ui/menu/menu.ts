import { addDisposableListener, append } from "src/cs/base/browser/dom";
import { ActionBar, ActionsOrientation, type ActionBarContent, type ActionBarOptions } from "src/cs/base/browser/ui/actionbar/actionbar";
import { ContentView } from "src/cs/base/browser/ui/contentView/contentView";
import { MenuItem, type MenuItemOptions } from "src/cs/base/browser/ui/menuItem/menuItem";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/menu/menu.css";

export type MenuOptions = {
    className?: string;
    role?: string;
    withScrollArea?: boolean;
};

export type MenuItemAction = {
    readonly className?: string;
    readonly icon?: Node | (() => Node);
    readonly label: string;
    readonly onClick: (event: MouseEvent | KeyboardEvent) => void;
};

export type MenuEntry =
    | { readonly kind: "separator" }
    | { readonly kind: "label"; readonly label: string }
    | ({ readonly kind?: "item"; readonly autoHide?: boolean; readonly rightAction?: MenuItemAction } & MenuItemOptions);

export type MenuButtonOptions = {
    readonly ariaLabel?: string;
    readonly className?: string;
    readonly items: readonly MenuEntry[] | (() => readonly MenuEntry[]);
    readonly label: string;
    readonly matchAnchorWidth?: boolean;
    readonly menuClassName?: string;
    readonly surfaceClassName?: string;
    readonly triggerIcon?: Node | (() => Node);
    readonly withScrollArea?: boolean;
};

export class Menu extends ActionBar {
    constructor(options: MenuOptions = {}) {
        super(createMenuActionBarOptions(options));
    }

    public appendItem(options?: MenuItemOptions): MenuItem {
        const item = this.registerItem(new MenuItem(options));
        this.append(item.domNode);
        return item;
    }

    public override appendSeparator(): HTMLDivElement {
        const separator = document.createElement("div");
        separator.className = "ui-menu__separator";
        separator.role = "separator";
        this.append(separator);
        return separator;
    }

    public appendGroupLabel(label: string): HTMLDivElement {
        const groupLabel = document.createElement("div");
        groupLabel.className = "ui-menu__group-label";
        groupLabel.textContent = label;
        this.append(groupLabel);
        return groupLabel;
    }
}

export function createMenu(options?: MenuOptions): Menu {
    return new Menu(options);
}

export class MenuButton extends Disposable {
    private readonly button: HTMLButtonElement;
    private readonly closeDisposables = this._register(new DisposableStore());
    private readonly renderDisposables = this._register(new DisposableStore());
    private readonly contentView: ContentView;
    private options: MenuButtonOptions;

    constructor(options: MenuButtonOptions) {
        super();
        this.options = options;
        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.setAttribute("aria-haspopup", "menu");
        this.button.setAttribute("aria-expanded", "false");

        this.contentView = this._register(new ContentView({
            anchor: this.button,
            className: options.surfaceClassName,
            matchAnchorWidth: options.matchAnchorWidth ?? true,
            render: container => this.renderMenu(container),
            variant: "menu",
        }));

        this._register(addDisposableListener(this.button, "click", event => {
            event.preventDefault();
            this.toggle();
        }));
        this._register(addDisposableListener(this.button, "keydown", event => {
            if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            this.show();
        }));

        this.update(options);
    }

    public get domNode(): HTMLButtonElement {
        return this.button;
    }

    public update(options: MenuButtonOptions): void {
        this.options = options;
        this.renderButton();
        this.contentView.update({
            className: options.surfaceClassName,
            matchAnchorWidth: options.matchAnchorWidth ?? true,
            render: container => this.renderMenu(container),
        });
    }

    public override dispose(): void {
        this.closeDisposables.dispose();
        this.renderDisposables.dispose();
        super.dispose();
    }

    private toggle(): void {
        if (this.button.getAttribute("aria-expanded") === "true") {
            this.hide();
            return;
        }

        this.show();
    }

    private show(): void {
        this.button.setAttribute("aria-expanded", "true");
        this.contentView.show();
        this.installCloseListeners();
        this.focusSelectedItem();
    }

    private hide(): void {
        this.button.setAttribute("aria-expanded", "false");
        this.closeDisposables.clear();
        this.renderDisposables.clear();
        this.contentView.hide();
    }

    private installCloseListeners(): void {
        this.closeDisposables.clear();
        this.closeDisposables.add(addDisposableListener(document, "mousedown", event => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }
            if (this.button.contains(target) || this.contentView.domNode.contains(target)) {
                return;
            }

            this.hide();
        }));
        this.closeDisposables.add(addDisposableListener(document, "keydown", event => {
            if (event.key === "Escape") {
                this.hide();
                this.button.focus();
            }
        }));
    }

    private renderButton(): void {
        this.button.className = classNames("ui-menu-button", this.options.className);
        if (this.options.ariaLabel) {
            this.button.setAttribute("aria-label", this.options.ariaLabel);
        }
        else {
            this.button.removeAttribute("aria-label");
        }

        const label = document.createElement("span");
        label.className = "ui-menu-button__label";
        label.textContent = this.options.label;

        const children: Node[] = [label];
        const icon = createNode(this.options.triggerIcon);
        if (icon) {
            const iconWrapper = document.createElement("span");
            iconWrapper.className = "ui-menu-button__icon";
            iconWrapper.append(icon);
            children.push(iconWrapper);
        }

        this.button.replaceChildren(...children);
    }

    private renderMenu(container: HTMLElement): void {
        this.renderDisposables.clear();
        const menu = createMenu({
            className: this.options.menuClassName,
            withScrollArea: this.options.withScrollArea,
        });

        for (const entry of resolveEntries(this.options.items)) {
            if (entry.kind === "separator") {
                menu.appendSeparator();
                continue;
            }
            if (entry.kind === "label") {
                menu.appendGroupLabel(entry.label);
                continue;
            }

            const { autoHide = true, kind: _kind, rightAction, ...itemOptions } = entry;
            menu.appendItem({
                ...itemOptions,
                onClick: event => {
                    itemOptions.onClick?.(event);
                    if (autoHide) {
                        this.hide();
                    }
                },
                right: rightAction ? this.createActionButton(rightAction) : itemOptions.right,
            });
        }

        container.append(menu.domNode);
        this.renderDisposables.add(menu);
    }

    private createActionButton(action: MenuItemAction): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = classNames("ui-menu__item-action", action.className);
        button.title = action.label;
        button.setAttribute("aria-label", action.label);

        const icon = createNode(action.icon);
        if (icon) {
            button.append(icon);
        }

        this.renderDisposables.add(addDisposableListener(button, "click", event => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick(event);
            this.hide();
        }));
        return button;
    }

    private focusSelectedItem(): void {
        requestAnimationFrame(() => {
            const selected = this.contentView.domNode.querySelector<HTMLElement>("[data-selected]");
            const first = this.contentView.domNode.querySelector<HTMLElement>(".ui-menu__item");
            (selected ?? first)?.focus();
        });
    }
}

export function createMenuButton(options: MenuButtonOptions): MenuButton {
    return new MenuButton(options);
}

export function createMenuItemLabel(label: string, icon?: Node | (() => Node)): HTMLSpanElement {
    const wrapper = document.createElement("span");
    wrapper.className = "ui-menu__item-left ui-menu__item-label";

    const iconNode = createNode(icon);
    if (iconNode) {
        const iconWrapper = document.createElement("span");
        iconWrapper.className = "ui-menu__item-icon";
        iconWrapper.append(iconNode);
        wrapper.append(iconWrapper);
    }

    const text = document.createElement("span");
    text.className = "ui-menu__item-text";
    text.textContent = label;
    wrapper.append(text);
    return wrapper;
}

function resolveEntries(entries: readonly MenuEntry[] | (() => readonly MenuEntry[])): readonly MenuEntry[] {
    return typeof entries === "function" ? entries() : entries;
}

function createNode(node: Node | (() => Node) | undefined): Node | undefined {
    return typeof node === "function" ? node() : node;
}

function createMenuActionBarOptions(options: MenuOptions): ActionBarOptions {
    return {
        className: classNames("ui-menu", options.className),
        contentClassName: "ui-menu__list",
        createContent: options.withScrollArea === false ? undefined : createMenuScrollContent,
        orientation: ActionsOrientation.VERTICAL,
        role: options.role ?? "menu",
    };
}

function createMenuScrollContent(element: HTMLElement): ActionBarContent {
    const scrollbar = new Scrollbar({
        className: "ui-menu__scroll-area max-h-60 -mr-1 pr-1",
        viewportClassName: "max-h-60",
    });
    scrollbar.viewport.style.height = "auto";
    scrollbar.viewport.style.maxHeight = "15rem";
    scrollbar.viewport.style.overflowY = "auto";

    element.appendChild(scrollbar.element);
    return {
        contentNode: scrollbar.viewport,
        disposable: scrollbar,
    };
}

function classNames(...names: Array<string | undefined>): string {
    return names
        .flatMap(name => name?.split(/\s+/g) ?? [])
        .filter(Boolean)
        .join(" ");
}

export default Menu;
