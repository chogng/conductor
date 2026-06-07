import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import type { IManagedHover } from "src/cs/base/browser/ui/hover/hover";
import { getBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { Action, ActionRunner, Separator, type IAction, type IActionChangeEvent, type IActionRunner } from "src/cs/base/common/actions";
import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/actionbar/actionbar.css";

const ActionTooltipPointerDownSuppress = 1000;

export interface IActionViewItem {
    readonly action: IAction;
    actionRunner: IActionRunner;
    setActionContext(context: unknown): void;
    render(container: HTMLElement): void;
    isEnabled(): boolean;
    focus(): void;
    blur(): void;
    dispose(): void;
}

export type IActionViewItemOptions = {
    readonly className?: string;
    readonly icon?: boolean;
    readonly label?: boolean;
    readonly role?: "button" | "menuitem" | "presentation";
};

export class BaseActionViewItem extends Disposable implements IActionViewItem {
    protected element: HTMLElement | undefined;
    protected label: HTMLButtonElement | undefined;
    protected context: unknown;
    private readonly tooltipHover = this._register(new MutableDisposable<IManagedHover>());
    private runner: IActionRunner | undefined;

    constructor(
        context: unknown,
        public readonly action: IAction,
        protected readonly options: IActionViewItemOptions = {},
    ) {
        super();
        this.context = context;

        if (action instanceof Action) {
            this._register(action.onDidChange(event => this.handleActionChangeEvent(event)));
        }
    }

    public get actionRunner(): IActionRunner {
        if (!this.runner) {
            this.runner = this._register(new ActionRunner());
        }

        return this.runner;
    }

    public set actionRunner(actionRunner: IActionRunner) {
        this.runner = actionRunner;
    }

    public setActionContext(context: unknown): void {
        this.context = context;
    }

    public isEnabled(): boolean {
        return this.action.enabled;
    }

    public render(container: HTMLElement): void {
        this.element = container;
        container.classList.add("ui-actionbar__item");
        container.setAttribute("role", "presentation");

        const label = document.createElement("button");
        label.type = "button";
        label.className = "ui-actionbar__label";
        label.setAttribute("role", this.options.role ?? this.getRole());
        this.label = label;
        container.append(label);

        this._register(addDisposableListener(label, EventType.CLICK, event => {
            event.preventDefault();
            event.stopPropagation();
            void this.run(event);
        }));

        this.updateClass();
        this.updateLabel();
        this.updateTooltip();
        this.updateEnabled();
        this.updateChecked();
    }

    public focus(): void {
        this.label?.focus();
    }

    public blur(): void {
        this.label?.blur();
    }

    public override dispose(): void {
        this.element?.remove();
        this.element = undefined;
        this.label = undefined;
        this.context = undefined;
        super.dispose();
    }

    protected async run(event: MouseEvent): Promise<void> {
        if (!this.action.enabled) {
            return;
        }

        const context = this.context ?? event;
        await this.actionRunner.run(this.action, context);
    }

    protected handleActionChangeEvent(event: IActionChangeEvent): void {
        if (!this.element) {
            return;
        }

        if (event.enabled !== undefined) {
            this.updateEnabled();
        }
        if (event.checked !== undefined) {
            this.updateChecked();
        }
        if (event.class !== undefined) {
            this.updateClass();
        }
        if (event.label !== undefined) {
            this.updateLabel();
            this.updateTooltip();
        }
        if (event.tooltip !== undefined) {
            this.updateTooltip();
        }
    }

    protected getRole(): "button" | "presentation" {
        return this.action.id === Separator.ID ? "presentation" : "button";
    }

    protected updateClass(): void {
        if (!this.label) {
            return;
        }

        this.label.className = "ui-actionbar__label";
        if (this.options.className) {
            this.label.classList.add(...this.options.className.split(/\s+/g).filter(Boolean));
        }
        if (this.options.icon) {
            this.label.classList.add("codicon");
        }
        if (this.action.class) {
            this.label.classList.add(...this.action.class.split(/\s+/g).filter(Boolean));
        }
    }

    protected updateLabel(): void {
        if (!this.label) {
            return;
        }

        this.label.textContent = this.options.label === false ? "" : this.action.label;
    }

    protected updateTooltip(): void {
        if (!this.label) {
            return;
        }

        const tooltip = this.action.tooltip || this.action.label;
        if (tooltip) {
            this.label.setAttribute("aria-label", tooltip);
            if (!this.tooltipHover.current) {
                this.tooltipHover.current = getBaseLayerHoverDelegate().setupManagedHover(this.label, tooltip, {
                    suppressOnPointerDown: ActionTooltipPointerDownSuppress,
                });
            }
            else {
                this.tooltipHover.current.update(tooltip);
            }
        }
        else {
            this.label.removeAttribute("aria-label");
            this.tooltipHover.clear();
        }
    }

    protected updateEnabled(): void {
        const disabled = !this.action.enabled;
        this.element?.classList.toggle("disabled", disabled);
        if (!this.label) {
            return;
        }

        this.label.disabled = disabled;
        this.label.setAttribute("aria-disabled", `${disabled}`);
    }

    protected updateChecked(): void {
        if (!this.label) {
            return;
        }

        if (this.action.checked === undefined) {
            this.label.classList.remove("checked");
            this.label.removeAttribute("aria-pressed");
            return;
        }

        this.label.classList.toggle("checked", this.action.checked);
        this.label.setAttribute("aria-pressed", `${this.action.checked}`);
    }
}

export class ActionViewItem extends BaseActionViewItem {
    constructor(
        context: unknown,
        action: IAction,
        options: IActionViewItemOptions = {},
    ) {
        super(context, action, options);
    }
}

export type ActionViewItemOptions = IActionViewItemOptions;
