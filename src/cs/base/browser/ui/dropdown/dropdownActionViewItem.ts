import { $, addDisposableListener, append, EventType } from "src/cs/base/browser/dom";
import { Action, type IAction, type IActionRunner } from "src/cs/base/common/actions";
import { Emitter } from "src/cs/base/common/event";
import { AnchorAlignment } from "src/cs/base/common/layout";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { IContextMenuDelegate, IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import { DropdownMenu, isActionProvider, type IActionProvider, type IDropdownMenuOptions, type ILabelRenderer } from "src/cs/base/browser/ui/dropdown/dropdown";

import "src/cs/base/browser/ui/dropdown/dropdown.css";

export interface IKeybindingProvider {
    (action: IAction): ReturnType<NonNullable<IContextMenuDelegate["getKeyBinding"]>>;
}

export interface IAnchorAlignmentProvider {
    (): AnchorAlignment;
}

export interface IDropdownMenuActionViewItemOptions {
    readonly keybindingProvider?: IKeybindingProvider;
    readonly actionRunner?: IActionRunner;
    readonly classNames?: string[] | string;
    readonly anchorAlignmentProvider?: IAnchorAlignmentProvider;
    readonly skipTelemetry?: boolean;
}

export class DropdownMenuActionViewItem extends Disposable {
    private dropdownMenu: DropdownMenu | undefined;
    private element: HTMLElement | undefined;
    private actionItem: HTMLElement | undefined;
    private context: unknown;
    private focusable = true;

    private readonly onDidChangeVisibilityEmitter = this._register(new Emitter<boolean>());
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;

    constructor(
        private readonly action: IAction,
        private readonly menuActionsOrProvider: readonly IAction[] | IActionProvider,
        private readonly contextMenuProvider: Pick<IContextMenuService, "showContextMenu">,
        private readonly options: IDropdownMenuActionViewItemOptions = {},
    ) {
        super();
    }

    public render(container: HTMLElement): void {
        this.actionItem = container;

        const labelRenderer: ILabelRenderer = (labelElement: HTMLElement): IDisposable | null => {
            this.element = append(labelElement, $("a.action-label"));
            this.renderLabel(this.element);
            this.setAriaLabelAttributes(this.element);
            return null;
        };

        let actions: readonly IAction[] | undefined;
        let actionProvider: IActionProvider | undefined;
        if (isActionProvider(this.menuActionsOrProvider)) {
            actionProvider = this.menuActionsOrProvider;
        }
        else {
            actions = this.menuActionsOrProvider;
        }
        const options: IDropdownMenuOptions = {
            contextMenuProvider: this.contextMenuProvider,
            labelRenderer,
            actions,
            actionProvider,
            skipTelemetry: this.options.skipTelemetry,
        };

        this.dropdownMenu = this._register(new DropdownMenu(container, options));
        this.dropdownMenu.menuOptions = this.createMenuOptions();

        this._register(this.dropdownMenu.onDidChangeVisibility(visible => {
            this.element?.setAttribute("aria-expanded", `${visible}`);
            this.onDidChangeVisibilityEmitter.fire(visible);
        }));

        this._register(addDisposableListener(this.element!, EventType.KEY_DOWN, event => {
            if (event.key !== "ArrowDown") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.show();
        }));

        this.updateTooltip();
        this.updateEnabled();
    }

    public setActionContext(context: unknown): void {
        this.context = context;

        if (this.dropdownMenu) {
            this.dropdownMenu.menuOptions = this.createMenuOptions();
        }
    }

    public show(): void {
        if (!this.action.enabled) {
            return;
        }

        this.dropdownMenu?.show();
    }

    public focus(): void {
        this.element?.focus();
    }

    public blur(): void {
        this.element?.blur();
    }

    public isFocused(): boolean {
        return this.element?.ownerDocument.activeElement === this.element;
    }

    public setFocusable(focusable: boolean): void {
        this.focusable = focusable;
        if (this.element) {
            this.element.tabIndex = focusable ? 0 : -1;
        }
    }

    protected renderLabel(element: HTMLElement): void {
        let classNames: string[] = [];

        if (typeof this.options.classNames === "string") {
            classNames = this.options.classNames.split(/\s+/g).filter(Boolean);
        }
        else if (this.options.classNames) {
            classNames = this.options.classNames;
        }

        if (!classNames.includes("icon")) {
            classNames.push("codicon");
        }

        element.classList.add(...classNames);
        element.textContent = classNames.length === 1 && classNames[0] === "codicon" ? this.action.label : "";
        this.setFocusable(this.focusable);
    }

    protected setAriaLabelAttributes(element: HTMLElement): void {
        element.setAttribute("role", "button");
        element.setAttribute("aria-haspopup", "true");
        element.setAttribute("aria-expanded", "false");
        element.ariaLabel = this.action.label;
    }

    protected updateTooltip(): void {
        if (this.element) {
            this.element.title = this.action.tooltip || this.action.label;
        }
    }

    protected updateEnabled(): void {
        const disabled = !this.action.enabled;
        this.actionItem?.classList.toggle("disabled", disabled);
        this.element?.classList.toggle("disabled", disabled);
        this.element?.setAttribute("aria-disabled", `${disabled}`);
    }

    private createMenuOptions(): DropdownMenu["menuOptions"] {
        const options = this.options;

        return {
            actionRunner: this.options.actionRunner,
            getKeyBinding: this.options.keybindingProvider,
            context: this.context,
            get anchorAlignment(): AnchorAlignment {
                return options.anchorAlignmentProvider?.() ?? AnchorAlignment.LEFT;
            },
        };
    }
}

export interface IActionWithDropdownActionViewItemOptions {
    readonly menuActionsOrProvider: readonly IAction[] | IActionProvider;
    readonly menuActionClassNames?: string[];
    readonly classNames?: string[] | string;
}

export class ActionWithDropdownActionViewItem extends Disposable {
    private primaryElement: HTMLElement | undefined;
    private dropdownMenuActionViewItem: DropdownMenuActionViewItem | undefined;

    constructor(
        private readonly context: unknown,
        private readonly action: IAction,
        private readonly options: IActionWithDropdownActionViewItemOptions,
        private readonly contextMenuProvider: Pick<IContextMenuService, "showContextMenu">,
    ) {
        super();
    }

    public render(container: HTMLElement): void {
        this.primaryElement = append(container, $("a.action-label"));
        this.primaryElement.textContent = this.action.label;
        this.primaryElement.title = this.action.tooltip || this.action.label;
        this.primaryElement.setAttribute("role", "button");
        this.primaryElement.tabIndex = 0;

        this._register(addDisposableListener(this.primaryElement, EventType.CLICK, event => {
            event.preventDefault();
            event.stopPropagation();
            void this.action.run(this.context);
        }));

        const menuActionsProvider = {
            getActions: () => {
                const actionsProvider = this.options.menuActionsOrProvider;
                return isActionProvider(actionsProvider) ? actionsProvider.getActions() : actionsProvider;
            },
        };

        const menuActionClassNames = this.options.menuActionClassNames ?? [];
        append(container, $(".action-dropdown-item-separator", undefined, $("div")));

        this.dropdownMenuActionViewItem = this._register(new DropdownMenuActionViewItem(
            this._register(new Action("dropdownAction", "More Actions...")),
            menuActionsProvider,
            this.contextMenuProvider,
            { classNames: ["dropdown", ...menuActionClassNames] },
        ));
        this.dropdownMenuActionViewItem.render(container);
        this.dropdownMenuActionViewItem.setActionContext(this.context);

        this._register(addDisposableListener(container, EventType.KEY_DOWN, event => {
            if (menuActionsProvider.getActions().length === 0) {
                return;
            }

            if (this.dropdownMenuActionViewItem?.isFocused() && event.key === "ArrowLeft") {
                event.preventDefault();
                this.dropdownMenuActionViewItem.blur();
                this.focus();
            }
            else if (this.isFocused() && event.key === "ArrowRight") {
                event.preventDefault();
                this.blur();
                this.dropdownMenuActionViewItem?.focus();
            }
        }));
    }

    public focus(): void {
        this.primaryElement?.focus();
    }

    public blur(): void {
        this.primaryElement?.blur();
        this.dropdownMenuActionViewItem?.blur();
    }

    public isFocused(): boolean {
        return this.primaryElement?.ownerDocument.activeElement === this.primaryElement;
    }

    public setFocusable(focusable: boolean): void {
        if (this.primaryElement) {
            this.primaryElement.tabIndex = focusable ? 0 : -1;
        }
        this.dropdownMenuActionViewItem?.setFocusable(focusable);
    }
}
