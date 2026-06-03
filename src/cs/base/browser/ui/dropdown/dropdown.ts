import { $, addDisposableListener, append, EventType } from "src/cs/base/browser/dom";
import { ContentView } from "src/cs/base/browser/ui/contentView/contentView";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { IAction, IActionRunner } from "src/cs/base/common/actions";
import { ActionRunner } from "src/cs/base/common/actions";
import { Emitter } from "src/cs/base/common/event";
import { AnchorAlignment } from "src/cs/base/common/layout";
import { Disposable, DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";
import type { IContextMenuDelegate, IContextMenuService } from "src/cs/platform/contextview/browser/contextView";

import "src/cs/base/browser/ui/dropdown/dropdown.css";

export interface ILabelRenderer {
    (container: HTMLElement): IDisposable | null;
}

export interface IBaseDropdownOptions {
    label?: string;
    labelRenderer?: ILabelRenderer;
}

export class BaseDropdown extends ActionRunner {
    private readonly dropdownElement: HTMLElement;
    private labelElement: HTMLElement | undefined;
    private visible = false;

    private readonly onDidChangeVisibilityEmitter = this._register(new Emitter<boolean>());
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;

    constructor(container: HTMLElement, options: IBaseDropdownOptions = {}) {
        super();

        this.dropdownElement = append(container, $(".monaco-dropdown"));
        this.labelElement = append(this.dropdownElement, $(".dropdown-label"));

        const labelRenderer = options.labelRenderer ?? ((target: HTMLElement): IDisposable | null => {
            target.textContent = options.label ?? "";
            return null;
        });

        this._register(addDisposableListener(this.dropdownElement, EventType.CLICK, event => {
            event.preventDefault();
            event.stopPropagation();
        }));

        this._register(addDisposableListener(this.labelElement, EventType.MOUSE_DOWN, event => {
            if (event.button !== 0) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.toggle();
        }));

        this._register(addDisposableListener(this.labelElement, EventType.KEY_DOWN, event => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.toggle();
        }));

        const labelDisposable = labelRenderer(this.labelElement);
        if (labelDisposable) {
            this._register(labelDisposable);
        }
    }

    public get element(): HTMLElement {
        return this.dropdownElement;
    }

    public get label(): HTMLElement | undefined {
        return this.labelElement;
    }

    public set tooltip(tooltip: string) {
        if (this.labelElement) {
            this.labelElement.title = tooltip;
        }
    }

    public show(): void {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.onDidChangeVisibilityEmitter.fire(true);
    }

    public hide(): void {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.onDidChangeVisibilityEmitter.fire(false);
    }

    public toggle(): void {
        if (this.visible) {
            this.hide();
            return;
        }

        this.show();
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public override dispose(): void {
        super.dispose();
        this.hide();
        this.labelElement?.remove();
        this.labelElement = undefined;
        this.dropdownElement.remove();
    }
}

export interface IActionProvider {
    getActions(): readonly IAction[];
}

export function isActionProvider(obj: unknown): obj is IActionProvider {
    const candidate = obj as IActionProvider | undefined;
    return typeof candidate?.getActions === "function";
}

export interface IMenuOptions {
    actionRunner?: IActionRunner;
    anchorAlignment?: AnchorAlignment;
    context?: unknown;
    getKeyBinding?: IContextMenuDelegate["getKeyBinding"];
}

export interface IDropdownMenuOptions extends IBaseDropdownOptions {
    readonly contextMenuProvider: Pick<IContextMenuService, "showContextMenu">;
    readonly actions?: readonly IAction[];
    readonly actionProvider?: IActionProvider;
    readonly skipTelemetry?: boolean;
}

export class DropdownMenu extends BaseDropdown {
    private currentMenuOptions: IMenuOptions | undefined;
    private currentActions: readonly IAction[] = [];

    constructor(container: HTMLElement, private readonly options: IDropdownMenuOptions) {
        super(container, options);
        this.currentActions = options.actions ?? [];
    }

    public set menuOptions(options: IMenuOptions | undefined) {
        this.currentMenuOptions = options;
    }

    public get menuOptions(): IMenuOptions | undefined {
        return this.currentMenuOptions;
    }

    private get actions(): readonly IAction[] {
        return this.options.actionProvider?.getActions() ?? this.currentActions;
    }

    public override show(): void {
        super.show();
        this.element.classList.add("active");

        this.options.contextMenuProvider.showContextMenu({
            getAnchor: () => this.element,
            getActions: () => this.actions,
            getActionsContext: () => this.currentMenuOptions?.context,
            getKeyBinding: action => this.currentMenuOptions?.getKeyBinding?.(action),
            onHide: () => this.onHide(),
            actionRunner: this.currentMenuOptions?.actionRunner,
            anchorAlignment: this.currentMenuOptions?.anchorAlignment ?? AnchorAlignment.LEFT,
            skipTelemetry: this.options.skipTelemetry,
        });
    }

    public override hide(): void {
        super.hide();
        this.element.classList.remove("active");
    }

    private onHide(): void {
        this.hide();
    }
}

export type DropdownOptions = {
    anchor?: HTMLElement | null;
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    content?: HTMLElement | null;
    focusAnchorOnEscape?: boolean;
    onDidChangeVisibility?: (visible: boolean) => void;
};

export type DropdownButtonIcon = Node | (() => Node) | LxIconDefinition;

export type DropdownButtonOptions = {
    readonly ariaLabel?: string;
    readonly className?: string;
    readonly closeOnContentEvent?: string;
    readonly label: string;
    readonly matchAnchorWidth?: boolean;
    readonly surfaceClassName?: string;
    readonly triggerIcon?: DropdownButtonIcon;
    readonly render: (container: HTMLElement) => IDisposable | void;
};

export class DropdownButton extends Disposable {
    private readonly button: HTMLButtonElement;
    private readonly contentView: ContentView;
    private readonly dropdown: Dropdown;
    private readonly renderDisposables = this._register(new DisposableStore());
    private options: DropdownButtonOptions;

    constructor(options: DropdownButtonOptions) {
        super();
        this.options = options;
        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.setAttribute("aria-haspopup", "menu");

        this.contentView = this._register(new ContentView({
            anchor: this.button,
            className: classNames("monaco-dropdown-surface", options.surfaceClassName),
            matchAnchorWidth: options.matchAnchorWidth ?? true,
            render: container => this.renderContent(container),
            variant: "menu",
        }));

        this.dropdown = this._register(new Dropdown({
            anchor: this.button,
            content: this.contentView.domNode,
            onDidChangeVisibility: visible => {
                if (visible) {
                    this.contentView.show();
                    this.focusSelectedItem();
                    return;
                }

                this.renderDisposables.clear();
                this.contentView.hide();
            },
        }));

        this._register(addDisposableListener(this.button, EventType.CLICK, event => {
            event.preventDefault();
            this.dropdown.toggle();
        }));
        this._register(addDisposableListener(this.button, EventType.KEY_DOWN, event => {
            if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            this.dropdown.show();
        }));

        this.update(options);
    }

    public get domNode(): HTMLButtonElement {
        return this.button;
    }

    public update(options: DropdownButtonOptions): void {
        this.options = options;
        this.renderButton();
        this.contentView.update({
            anchor: this.button,
            className: classNames("monaco-dropdown-surface", options.surfaceClassName),
            matchAnchorWidth: options.matchAnchorWidth ?? true,
            render: container => this.renderContent(container),
        });
    }

    public show(): void {
        this.dropdown.show();
    }

    public hide(): void {
        this.dropdown.hide();
    }

    public toggle(): void {
        this.dropdown.toggle();
    }

    public override dispose(): void {
        this.renderDisposables.dispose();
        super.dispose();
    }

    private renderButton(): void {
        this.button.className = classNames("ui-dropdown-button", this.options.className);
        if (this.options.ariaLabel) {
            this.button.setAttribute("aria-label", this.options.ariaLabel);
        }
        else {
            this.button.removeAttribute("aria-label");
        }

        const label = document.createElement("span");
        label.className = "ui-dropdown-button__label";
        label.textContent = this.options.label;

        const children: Node[] = [label];
        const icon = createIconNode(this.options.triggerIcon);
        if (icon) {
            const iconWrapper = document.createElement("span");
            iconWrapper.className = "ui-dropdown-button__icon";
            iconWrapper.append(icon);
            children.push(iconWrapper);
        }

        this.button.replaceChildren(...children);
    }

    private renderContent(container: HTMLElement): void {
        this.renderDisposables.clear();
        const contentDisposable = this.options.render(container);
        if (contentDisposable) {
            this.renderDisposables.add(contentDisposable);
        }
        if (this.options.closeOnContentEvent) {
            this.renderDisposables.add(addDisposableListener(container, this.options.closeOnContentEvent, () => {
                this.dropdown.hide();
            }));
        }
    }

    private focusSelectedItem(): void {
        requestAnimationFrame(() => {
            const selected = this.contentView.domNode.querySelector<HTMLElement>("[data-selected] > .ui-actionbar__label");
            const first = this.contentView.domNode.querySelector<HTMLElement>(".ui-menu__item > .ui-actionbar__label");
            (selected ?? first)?.focus();
        });
    }
}

export function createDropdownButton(options: DropdownButtonOptions): DropdownButton {
    return new DropdownButton(options);
}

export class Dropdown implements IDisposable {
    private readonly disposables = new DisposableStore();
    private readonly closeDisposables = new DisposableStore();
    private readonly visibilityEmitter = new Emitter<boolean>();
    private anchor: HTMLElement | null;
    private content: HTMLElement | null;
    private visible = false;
    private options: Required<Pick<DropdownOptions, "closeOnClickOutside" | "closeOnEscape" | "focusAnchorOnEscape">>;

    public readonly onDidChangeVisibility = this.visibilityEmitter.event;

    constructor(options: DropdownOptions = {}) {
        this.anchor = options.anchor ?? null;
        this.content = options.content ?? null;
        this.options = {
            closeOnClickOutside: options.closeOnClickOutside ?? true,
            closeOnEscape: options.closeOnEscape ?? true,
            focusAnchorOnEscape: options.focusAnchorOnEscape ?? true,
        };

        this.disposables.add(this.closeDisposables);

        if (options.onDidChangeVisibility) {
            this.disposables.add(this.onDidChangeVisibility(options.onDidChangeVisibility));
        }

        this.applyAnchorState();
    }

    public setAnchor(anchor: HTMLElement | null): void {
        this.anchor = anchor;
        this.applyAnchorState();
    }

    public setContent(content: HTMLElement | null): void {
        this.content = content;
        this.applyContentState();
    }

    public updateOptions(options: Pick<DropdownOptions, "closeOnClickOutside" | "closeOnEscape" | "focusAnchorOnEscape">): void {
        this.options = {
            closeOnClickOutside: options.closeOnClickOutside ?? this.options.closeOnClickOutside,
            closeOnEscape: options.closeOnEscape ?? this.options.closeOnEscape,
            focusAnchorOnEscape: options.focusAnchorOnEscape ?? this.options.focusAnchorOnEscape,
        };

        if (this.visible) {
            this.installListeners();
        }
    }

    public show(): void {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.applyAnchorState();
        this.applyContentState();
        this.installListeners();
        this.visibilityEmitter.fire(true);
    }

    public hide(): void {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.closeDisposables.clear();
        this.applyAnchorState();
        this.applyContentState();
        this.visibilityEmitter.fire(false);
    }

    public toggle(): void {
        if (this.visible) {
            this.hide();
            return;
        }

        this.show();
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public dispose(): void {
        this.hide();
        this.disposables.dispose();
        this.visibilityEmitter.dispose();
    }

    private installListeners(): void {
        this.closeDisposables.clear();

        if (this.options.closeOnEscape) {
            this.closeDisposables.add(addDisposableListener(document, "keydown", event => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.hide();
                    if (this.options.focusAnchorOnEscape) {
                        this.anchor?.focus();
                    }
                }
            }));
        }

        if (this.options.closeOnClickOutside) {
            this.closeDisposables.add(addDisposableListener(document, "mousedown", event => {
                const target = event.target;
                if (!(target instanceof Node)) {
                    return;
                }
                if (this.anchor?.contains(target)) {
                    return;
                }
                if (this.content?.contains(target)) {
                    return;
                }

                this.hide();
            }));
        }
    }

    private applyAnchorState(): void {
        if (!this.anchor) {
            return;
        }

        this.anchor.classList.toggle("active", this.visible);
        this.anchor.setAttribute("aria-expanded", `${this.visible}`);
    }

    private applyContentState(): void {
        if (!this.content) {
            return;
        }

        this.content.hidden = !this.visible;
        this.content.dataset.state = this.visible ? "open" : "closed";
        this.content.setAttribute("aria-hidden", this.visible ? "false" : "true");
    }
}

export default Dropdown;

function createIconNode(icon: DropdownButtonIcon | undefined): Node | undefined {
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

function classNames(...names: Array<string | undefined>): string {
    return names
        .flatMap(name => name?.split(/\s+/g) ?? [])
        .filter(Boolean)
        .join(" ");
}
