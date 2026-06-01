import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { Action, ActionRunner, Separator, type IAction, type IActionChangeEvent, type IActionRunner } from "src/cs/base/common/actions";
import { Disposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/actionbar/actionbar.css";

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

export type ActionViewItemOptions = {
    readonly className?: string;
    readonly icon?: boolean;
    readonly label?: boolean;
    readonly role?: "button" | "menuitem" | "presentation";
};

export class ActionViewItem extends Disposable implements IActionViewItem {
    private element: HTMLElement | undefined;
    private label: HTMLButtonElement | undefined;
    private context: unknown;
    private runner: IActionRunner | undefined;

    constructor(
        context: unknown,
        public readonly action: IAction,
        private readonly options: ActionViewItemOptions = {},
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

    private async run(event: MouseEvent): Promise<void> {
        if (!this.action.enabled) {
            return;
        }

        const context = this.context ?? event;
        await this.actionRunner.run(this.action, context);
    }

    private handleActionChangeEvent(event: IActionChangeEvent): void {
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

    private getRole(): "button" | "presentation" {
        return this.action.id === Separator.ID ? "presentation" : "button";
    }

    private updateClass(): void {
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

    private updateLabel(): void {
        if (!this.label) {
            return;
        }

        this.label.textContent = this.options.label === false ? "" : this.action.label;
    }

    private updateTooltip(): void {
        if (!this.label) {
            return;
        }

        const tooltip = this.action.tooltip || this.action.label;
        if (tooltip) {
            this.label.title = tooltip;
            this.label.setAttribute("aria-label", tooltip);
        }
        else {
            this.label.removeAttribute("title");
            this.label.removeAttribute("aria-label");
        }
    }

    private updateEnabled(): void {
        const disabled = !this.action.enabled;
        this.element?.classList.toggle("disabled", disabled);
        if (!this.label) {
            return;
        }

        this.label.disabled = disabled;
        this.label.setAttribute("aria-disabled", `${disabled}`);
    }

    private updateChecked(): void {
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
