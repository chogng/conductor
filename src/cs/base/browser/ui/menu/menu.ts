import { addDisposableListener, append } from "src/cs/base/browser/dom";
import { ActionBar, ActionsOrientation, type ActionBarContent, type ActionBarOptions, type IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import { BaseActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { ContentView } from "src/cs/base/browser/ui/contentView/contentView";
import "src/cs/base/browser/ui/dropdown/dropdown.css";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { IAction, Separator } from "src/cs/base/common/actions";
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

export type MenuButtonOptions = {
    readonly ariaLabel?: string;
    readonly className?: string;
    readonly items: readonly IAction[] | (() => readonly IAction[]);
    readonly label: string;
    readonly matchAnchorWidth?: boolean;
    readonly menuClassName?: string;
    readonly surfaceClassName?: string;
    readonly triggerIcon?: Node | (() => Node);
    readonly withScrollArea?: boolean;
};

type MenuActionOptions = {
    readonly autoHide?: boolean;
    readonly checked?: boolean;
    readonly className?: string;
    readonly enabled?: boolean;
    readonly id: string;
    readonly label: string;
    readonly left?: Node | string;
    readonly onMouseEnter?: (event: MouseEvent) => void;
    readonly right?: Node | string;
    readonly rightAction?: MenuItemAction;
    readonly role?: "button" | "menuitem" | "presentation";
    readonly run: (event?: unknown) => unknown;
    readonly selected?: boolean;
    readonly tabIndex?: number;
    readonly tooltip?: string;
    readonly value?: string;
};

type MenuItemData = {
    readonly autoHide: boolean;
    readonly left: Node | string | undefined;
    readonly onMouseEnter: ((event: MouseEvent) => void) | undefined;
    readonly right: Node | string | undefined;
    readonly rightAction: MenuItemAction | undefined;
    readonly role: "button" | "menuitem" | "presentation" | undefined;
    readonly selected: boolean;
    readonly tabIndex: number | undefined;
    readonly value: string | undefined;
};

const menuItemData = new WeakMap<IAction, MenuItemData>();

export class Menu extends ActionBar {
    constructor(options: MenuOptions = {}) {
        super(createMenuActionBarOptions(options));
    }

    public appendItem(action: IAction): void {
        this.push(action);
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
            className: classNames("monaco-dropdown-surface", options.surfaceClassName),
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
            className: classNames("monaco-dropdown-surface", options.surfaceClassName),
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

        for (const action of resolveItems(this.options.items)) {
            if (action instanceof Separator) {
                menu.appendSeparator();
                continue;
            }

            const shouldAutoHide = getMenuItemData(action)?.autoHide ?? true;
            if (shouldAutoHide) {
                const hideOnRun = menu.onDidRun(event => {
                    if (event.action === action && !event.error) {
                        hideOnRun.dispose();
                        this.hide();
                    }
                });
                this.renderDisposables.add(hideOnRun);
            }

            menu.appendItem(action);
        }

        this.renderDisposables.add(addDisposableListener(menu.domNode, "menuitemactionrun", () => {
            this.hide();
        }));
        container.append(menu.domNode);
        this.renderDisposables.add(menu);
    }

    private focusSelectedItem(): void {
        requestAnimationFrame(() => {
            const selected = this.contentView.domNode.querySelector<HTMLElement>("[data-selected] > .ui-actionbar__label");
            const first = this.contentView.domNode.querySelector<HTMLElement>(".ui-menu__item > .ui-actionbar__label");
            (selected ?? first)?.focus();
        });
    }
}

export function createMenuButton(options: MenuButtonOptions): MenuButton {
    return new MenuButton(options);
}

export function createMenuAction(options: MenuActionOptions): IAction {
    const action: IAction = {
        id: options.id,
        label: options.label,
        tooltip: options.tooltip ?? options.label,
        class: options.className,
        enabled: options.enabled ?? true,
        checked: options.checked,
        run: event => options.run(event),
    };

    menuItemData.set(action, {
        autoHide: options.autoHide ?? true,
        left: options.left,
        onMouseEnter: options.onMouseEnter,
        right: options.right,
        rightAction: options.rightAction,
        role: options.role,
        selected: options.selected ?? false,
        tabIndex: options.tabIndex,
        value: options.value,
    });

    return action;
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

function resolveItems(items: readonly IAction[] | (() => readonly IAction[])): readonly IAction[] {
    return typeof items === "function" ? items() : items;
}

function createNode(node: Node | (() => Node) | undefined): Node | undefined {
    return typeof node === "function" ? node() : node;
}

function createMenuActionBarOptions(options: MenuOptions): ActionBarOptions {
    return {
        actionViewItemProvider: createMenuActionViewItem,
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

const createMenuActionViewItem: IActionViewItemProvider = (action, options) => {
    if (action instanceof Separator) {
        return undefined;
    }

    return new MenuActionViewItem(action, options);
};

class MenuActionViewItem extends BaseActionViewItem {
    private readonly data: MenuItemData | undefined;

    constructor(
        action: IAction,
        options: IActionViewItemOptions,
    ) {
        super(undefined, action, {
            ...options,
            className: action.class,
            role: getMenuItemData(action)?.role ?? "menuitem",
        });
        this.data = getMenuItemData(action);
    }

    public override render(container: HTMLElement): void {
        container.classList.add("ui-menu__item");

        if (this.data?.selected) {
            container.dataset.selected = "true";
        }
        if (this.data?.value !== undefined) {
            container.dataset.value = this.data.value;
        }

        super.render(container);

        if (typeof this.data?.tabIndex === "number" && this.label) {
            this.label.tabIndex = this.data.tabIndex;
        }

        if (this.data?.left !== undefined) {
            this.updateLabel();
        }
        if (this.data?.right !== undefined || this.data?.rightAction) {
            const right = document.createElement("span");
            right.className = "ui-menu__item-right";
            if (this.data.right !== undefined) {
                append(right, this.data.right);
            }
            if (this.data.rightAction) {
                right.append(this.createActionButton(this.data.rightAction));
            }
            container.append(right);
        }
        if (this.data?.onMouseEnter) {
            const action = this.action;
            const onMouseEnter = this.data.onMouseEnter;
            this._register(addDisposableListener(container, "mouseenter", event => {
                if (action.enabled) {
                    onMouseEnter?.(event);
                }
            }));
        }
    }

    protected override updateLabel(): void {
        if (!this.label || this.data?.left === undefined) {
            super.updateLabel();
            return;
        }

        this.label.replaceChildren();
        append(this.label, this.data.left);
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

        this._register(addDisposableListener(button, "click", event => {
            event.preventDefault();
            event.stopPropagation();
            action.onClick(event);
            this.element?.dispatchEvent(new CustomEvent("menuitemactionrun", { bubbles: true }));
        }));

        return button;
    }
}

function getMenuItemData(action: IAction): MenuItemData | undefined {
    return menuItemData.get(action);
}

function classNames(...names: Array<string | undefined>): string {
    return names
        .flatMap(name => name?.split(/\s+/g) ?? [])
        .filter(Boolean)
        .join(" ");
}

export default Menu;
