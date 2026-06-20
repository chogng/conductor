import { addDisposableListener, append } from "src/cs/base/browser/dom";
import { ActionBar, ActionsOrientation, type ActionBarContent, type ActionBarOptions, type IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import { BaseActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { EmptySubmenuAction, IAction, Separator, SubmenuAction } from "src/cs/base/common/actions";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";

import "src/cs/base/browser/ui/menu/menu.css";

export type MenuOptions = {
    className?: string;
    role?: string;
    withScrollArea?: boolean;
};

export type MenuIcon = Node | (() => Node) | LxIconDefinition;

export type MenuItemAction = {
    readonly className?: string;
    readonly icon?: MenuIcon;
    readonly id?: string;
    readonly label: string;
    readonly onClick: (event: MouseEvent | KeyboardEvent) => void;
};

export type MenuItems = readonly IAction[] | (() => readonly IAction[]);

export type RenderMenuOptions = {
    readonly className?: string;
    readonly items: MenuItems;
    readonly withScrollArea?: boolean;
};

type MenuActionOptions = {
    readonly autoHide?: boolean;
    readonly checked?: boolean;
    readonly className?: string;
    readonly enabled?: boolean;
    readonly icon?: MenuIcon;
    readonly id: string;
    readonly label: string;
    readonly left?: Node | string;
    readonly onMouseEnter?: (event: MouseEvent) => void;
    readonly right?: Node | string;
    readonly rightAction?: MenuItemAction;
    readonly rightActions?: readonly MenuItemAction[];
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
    readonly rightActions: readonly MenuItemAction[] | undefined;
    readonly role: "button" | "menuitem" | "presentation" | undefined;
    readonly selected: boolean;
    readonly tabIndex: number | undefined;
    readonly value: string | undefined;
};

const menuItemData = new WeakMap<IAction, MenuItemData>();

type MenuSubmenuEntry = {
    readonly container: HTMLElement;
    readonly menu: Menu;
    close(): void;
    contains(target: Node): boolean;
};

type MenuSubmenuData = {
    active: MenuSubmenuEntry | undefined;
};

export class Menu extends ActionBar {
    private readonly submenuData: MenuSubmenuData;

    constructor(options: MenuOptions = {}) {
        const submenuData: MenuSubmenuData = {
            active: undefined,
        };
        super(createMenuActionBarOptions(options, submenuData));
        this.submenuData = submenuData;
    }

    public appendItem(action: IAction): void {
        this.push(action);
    }

    public contains(target: Node): boolean {
        return this.domNode.contains(target) || !!this.submenuData.active?.contains(target);
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

    public override clear(): void {
        this.submenuData.active?.close();
        super.clear();
    }

    public override dispose(): void {
        this.submenuData.active?.close();
        super.dispose();
    }
}

export function createMenu(options?: MenuOptions): Menu {
    return new Menu(options);
}

export function renderMenuItems(container: HTMLElement, options: RenderMenuOptions): IDisposable {
    const disposables = new DisposableStore();
    const menu = createMenu({
        className: options.className,
        withScrollArea: options.withScrollArea,
    });

    for (const action of resolveItems(options.items)) {
        if (action instanceof Separator) {
            menu.appendSeparator();
            continue;
        }

        menu.appendItem(action);
    }

    container.append(menu.domNode);
    disposables.add(menu);
    return disposables;
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
        left: options.left ?? (options.icon ? createMenuItemLabel(options.label, options.icon) : undefined),
        onMouseEnter: options.onMouseEnter,
        right: options.right,
        rightAction: options.rightAction,
        rightActions: options.rightActions,
        role: options.role,
        selected: options.selected ?? false,
        tabIndex: options.tabIndex,
        value: options.value,
    });

    return action;
}

export function createMenuActionFromAction(
    action: IAction,
    overrides: Pick<MenuActionOptions, "checked" | "left" | "right" | "run"> &
        Partial<Pick<MenuActionOptions, "onMouseEnter">>,
): IAction {
    const data = getMenuItemData(action);
    return createMenuAction({
        autoHide: data?.autoHide,
        checked: overrides.checked ?? action.checked,
        className: action.class,
        enabled: action.enabled,
        id: action.id,
        label: action.label,
        left: overrides.left ?? data?.left,
        onMouseEnter: overrides.onMouseEnter ?? data?.onMouseEnter,
        right: overrides.right ?? data?.right,
        rightAction: data?.rightAction,
        rightActions: data?.rightActions,
        role: data?.role,
        run: overrides.run,
        selected: data?.selected,
        tabIndex: data?.tabIndex,
        tooltip: action.tooltip || action.label,
        value: data?.value,
    });
}

export function createMenuItemLabel(label: string, icon?: MenuIcon): HTMLSpanElement {
    const wrapper = document.createElement("span");
    wrapper.className = "ui-menu__item-left ui-menu__item-label";

    const iconNode = createIconNode(icon);
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

export function createCheckedMenuItemLabel(
    label: string,
    checkedRepresentation: "checkbox" | "radio",
): HTMLSpanElement {
    const indicator = document.createElement("span");
    indicator.className = "ui-menu__check-indicator";
    indicator.append(createLxIcon({ icon: LxIcon.check, size: 14 }));
    return createMenuItemLabel(label, indicator);
}

function resolveItems(items: readonly IAction[] | (() => readonly IAction[])): readonly IAction[] {
    return typeof items === "function" ? items() : items;
}

function createIconNode(icon: MenuIcon | undefined): Node | undefined {
    if (!icon) {
        return undefined;
    }
    if (icon instanceof Node) {
        return icon;
    }
    if (typeof icon === "function") {
        const rendered = icon();
        return rendered instanceof Node ? rendered : createLxIcon({ icon: () => rendered, size: 14 });
    }

    return createLxIcon({ icon, size: 14 });
}

function createMenuActionBarOptions(options: MenuOptions, submenuData: MenuSubmenuData): ActionBarOptions {
    return {
        actionViewItemProvider: (action, itemOptions) =>
            createMenuActionViewItem(action, itemOptions, submenuData, options),
        className: classNames("ui-menu", options.className),
        contentClassName: "ui-menu__list",
        createContent: options.withScrollArea === false ? undefined : createMenuScrollContent,
        orientation: ActionsOrientation.VERTICAL,
        role: options.role ?? "menu",
    };
}

function createMenuScrollContent(element: HTMLElement): ActionBarContent {
    const scrollbar = new Scrollbar({
        className: "ui-menu__scroll-area",
        viewportClassName: "ui-menu__scroll-viewport",
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

const createMenuActionViewItem = (
    action: IAction,
    options: IActionViewItemOptions,
    submenuData: MenuSubmenuData,
    menuOptions: MenuOptions,
) => {
    if (action instanceof Separator) {
        return undefined;
    }

    if (action instanceof SubmenuAction) {
        return new SubmenuMenuActionViewItem(action, options, submenuData, menuOptions);
    }

    return new MenuActionViewItem(action, options, submenuData);
};

class MenuActionViewItem extends BaseActionViewItem {
    private readonly data: MenuItemData | undefined;

    constructor(
        action: IAction,
        options: IActionViewItemOptions,
        protected readonly submenuData: MenuSubmenuData,
        private readonly closeSubmenuOnMouseEnter = true,
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
        if (this.data?.right !== undefined || this.data?.rightAction || this.data?.rightActions?.length) {
            const right = document.createElement("span");
            right.className = "ui-menu__item-right";
            if (this.data.right !== undefined) {
                append(right, this.data.right);
            }
            if (this.data.rightActions?.length) {
                right.append(this.createActionBar(this.data.rightActions));
            }
            if (this.data.rightAction) {
                right.append(this.createActionButton(this.data.rightAction));
            }
            container.append(right);
        }
        if (this.closeSubmenuOnMouseEnter || this.data?.onMouseEnter) {
            const action = this.action;
            const onMouseEnter = this.data?.onMouseEnter;
            this._register(addDisposableListener(container, "mouseenter", event => {
                if (action.enabled) {
                    if (this.closeSubmenuOnMouseEnter) {
                        this.submenuData.active?.close();
                    }
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

    protected override updateTooltip(): void {
        if (!this.label) {
            return;
        }

        const label = this.action.tooltip || this.action.label;
        if (label) {
            this.label.setAttribute("aria-label", label);
        }
        else {
            this.label.removeAttribute("aria-label");
        }
    }

    protected override updateChecked(): void {
        if (!this.label) {
            return;
        }

        const checked = this.action.checked;
        this.label.classList.toggle("checked", !!checked);
        if (checked !== undefined) {
            this.label.setAttribute("role", "menuitemcheckbox");
            this.label.setAttribute("aria-checked", checked ? "true" : "false");
            this.label.removeAttribute("aria-pressed");
            return;
        }

        this.label.setAttribute("role", this.data?.role ?? "menuitem");
        this.label.removeAttribute("aria-checked");
        this.label.removeAttribute("aria-pressed");
    }

    protected override async run(event: MouseEvent): Promise<void> {
        await super.run(event);
        if (this.data?.autoHide !== false) {
            this.element?.dispatchEvent(new CustomEvent("menuitemactionrun", { bubbles: true }));
        }
    }

    private createActionButton(action: MenuItemAction): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = classNames("ui-menu__item-action", action.className);
        button.title = action.label;
        button.setAttribute("aria-label", action.label);

        const icon = createIconNode(action.icon);
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

    private createActionBar(actions: readonly MenuItemAction[]): HTMLElement {
        const actionBar = this._register(new ActionBar({
            actionViewItemProvider: createMenuItemActionViewItem,
            className: "ui-menu__item-actionbar ui-menu__item-right-actionbar",
            role: "toolbar",
        }));

        actionBar.push(actions.map((item, index) => createMenuItemToolbarAction(item, this.action.id, index)), {
            label: false,
        });
        this._register(actionBar.onDidRun(() => {
            this.element?.dispatchEvent(new CustomEvent("menuitemactionrun", { bubbles: true }));
        }));

        return actionBar.domNode;
    }
}

class SubmenuMenuActionViewItem extends MenuActionViewItem {
    private readonly submenuDisposables = this._register(new DisposableStore());
    private readonly emptySubmenuActions = this._register(new DisposableStore());
    private submenuEntry: MenuSubmenuEntry | undefined;

    constructor(
        private readonly submenuAction: SubmenuAction,
        options: IActionViewItemOptions,
        submenuData: MenuSubmenuData,
        private readonly menuOptions: MenuOptions,
    ) {
        super(submenuAction, options, submenuData, false);
    }

    public override render(container: HTMLElement): void {
        super.render(container);
        container.classList.add("ui-menu__item--submenu");

        if (this.label) {
            this.label.tabIndex = 0;
            this.label.setAttribute("aria-haspopup", "true");
            this.updateAriaExpanded(false);
        }

        const right = document.createElement("span");
        right.className = "ui-menu__item-right ui-menu__submenu-indicator";
        right.setAttribute("aria-hidden", "true");
        right.append(createLxIcon({ icon: LxIcon.chevronRight, size: 14 }));
        container.append(right);

        this._register(addDisposableListener(container, "mouseenter", () => {
            if (this.submenuAction.enabled) {
                this.showSubmenu(false);
            }
        }));
        this._register(addDisposableListener(container, "keydown", event => {
            if (event.key !== "ArrowRight" && event.key !== "Enter") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.showSubmenu(true);
        }));
    }

    public override dispose(): void {
        this.closeSubmenu();
        super.dispose();
    }

    protected override async run(): Promise<void> {
        this.showSubmenu(true);
    }

    protected override updateEnabled(): void {
        // Native menus keep submenu entries interactive even when their child actions vary in enablement.
    }

    private showSubmenu(focusFirstItem: boolean): void {
        if (!this.element) {
            return;
        }

        if (this.submenuEntry && this.submenuData.active === this.submenuEntry) {
            if (focusFirstItem) {
                this.submenuEntry.menu.focus();
            }
            return;
        }

        this.submenuData.active?.close();
        this.submenuDisposables.clear();
        this.emptySubmenuActions.clear();
        this.element.dataset.highlighted = "true";
        this.updateAriaExpanded(true);

        const container = document.createElement("div");
        container.className = "context-view fixed ui-menu-container ui-submenu-container";
        container.style.position = "fixed";
        container.style.zIndex = `${getMenuZIndex(this.element) + 1}`;
        document.body.append(container);

        const menu = createMenu({
            className: this.menuOptions.className,
            withScrollArea: this.menuOptions.withScrollArea,
        });
        menu.actionRunner = this.actionRunner;

        for (const action of this.getSubmenuActions()) {
            if (action instanceof Separator) {
                menu.appendSeparator();
                continue;
            }

            menu.appendItem(action);
        }

        container.append(menu.domNode);
        const { left, top } = calculateSubmenuLayout(
            this.element.getBoundingClientRect(),
            container.getBoundingClientRect(),
            {
                height: window.innerHeight,
                width: window.innerWidth,
            },
        );
        container.style.left = `${Math.floor(left)}px`;
        container.style.top = `${Math.floor(top)}px`;

        const entry: MenuSubmenuEntry = {
            container,
            menu,
            close: () => this.closeSubmenu(),
            contains: target => container.contains(target) || menu.contains(target),
        };
        this.submenuEntry = entry;
        this.submenuData.active = entry;

        this.submenuDisposables.add(menu);
        this.submenuDisposables.add(addDisposableListener(menu.domNode, "menuitemactionrun", () => {
            this.element?.dispatchEvent(new CustomEvent("menuitemactionrun", { bubbles: true }));
        }));
        this.submenuDisposables.add({
            dispose: () => {
                container.remove();
            },
        });

        if (focusFirstItem) {
            menu.focus();
        }
    }

    private closeSubmenu(): void {
        if (this.submenuData.active === this.submenuEntry) {
            this.submenuData.active = undefined;
        }

        delete this.element?.dataset.highlighted;
        this.updateAriaExpanded(false);
        this.submenuEntry = undefined;
        this.submenuDisposables.clear();
        this.emptySubmenuActions.clear();
    }

    private getSubmenuActions(): readonly IAction[] {
        if (this.submenuAction.actions.length > 0) {
            return this.submenuAction.actions;
        }

        return [this.emptySubmenuActions.add(new EmptySubmenuAction())];
    }

    private updateAriaExpanded(expanded: boolean): void {
        this.label?.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
}

const menuToolbarActionData = new WeakMap<IAction, MenuItemAction>();

function createMenuItemToolbarAction(
    item: MenuItemAction,
    ownerId: string,
    index: number,
): IAction {
    const action: IAction = {
        id: item.id ?? `${ownerId}.action.${index}`,
        label: item.label,
        tooltip: item.label,
        class: item.className,
        enabled: true,
        run: event => item.onClick(event as MouseEvent | KeyboardEvent),
    };
    menuToolbarActionData.set(action, item);
    return action;
}

const createMenuItemActionViewItem: IActionViewItemProvider = (action, options) =>
    new MenuItemActionViewItem(action, options);

class MenuItemActionViewItem extends BaseActionViewItem {
    private readonly item = menuToolbarActionData.get(this.action);

    constructor(
        action: IAction,
        options: IActionViewItemOptions,
    ) {
        super(undefined, action, options);
    }

    protected override updateClass(): void {
        super.updateClass();
        this.label?.classList.add("ui-menu__item-action");
    }

    protected override updateLabel(): void {
        if (!this.label) {
            return;
        }

        this.label.replaceChildren();
        const icon = createIconNode(this.item?.icon);
        if (icon) {
            this.label.append(icon);
        }
    }
}

function getMenuItemData(action: IAction): MenuItemData | undefined {
    return menuItemData.get(action);
}

export function calculateSubmenuLayout(
    anchorRect: Pick<DOMRectReadOnly, "left" | "right" | "top">,
    menuRect: Pick<DOMRectReadOnly, "height" | "width">,
    viewport: { readonly height: number; readonly width: number },
): { readonly left: number; readonly top: number } {
    return {
        left: anchorRect.right + menuRect.width <= viewport.width
            ? anchorRect.right
            : Math.max(0, anchorRect.left - menuRect.width),
        top: Math.min(
            Math.max(0, anchorRect.top),
            Math.max(0, viewport.height - menuRect.height),
        ),
    };
}

function getMenuZIndex(element: HTMLElement): number {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        const value = Number(current.style.zIndex || getComputedStyle(current).zIndex);
        if (Number.isFinite(value)) {
            return value;
        }
    }

    return 2575;
}

function classNames(...names: Array<string | undefined>): string {
    return names
        .flatMap(name => name?.split(/\s+/g) ?? [])
        .filter(Boolean)
        .join(" ");
}

export default Menu;
