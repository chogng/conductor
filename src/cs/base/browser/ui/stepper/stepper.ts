/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import type { IActionViewItem } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Action, ActionRunner, type IAction, type IActionChangeEvent, type IActionRunner } from "src/cs/base/common/actions";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";

import "src/cs/base/browser/ui/stepper/stepper.css";

type StepperDataset = Readonly<Record<string, string>>;

export type StepperActionSlotOptions = {
    readonly action: IAction;
    readonly className?: string;
    readonly dataset?: StepperDataset;
    readonly icon?: LxIconDefinition;
    readonly keyShortcuts?: string;
};

export type StepperValueSlotOptions =
    | {
        readonly action: IAction;
        readonly className?: string;
        readonly dataset?: StepperDataset;
        readonly kind: "button";
        readonly live?: "polite";
    }
    | {
        readonly className?: string;
        readonly dataset?: StepperDataset;
        readonly kind: "text";
        readonly label?: string;
        readonly live?: "polite";
    };

export type StepperOptions = {
    readonly ariaLabel: string;
    readonly className?: string;
    readonly decrease: StepperActionSlotOptions;
    readonly increase: StepperActionSlotOptions;
    readonly value: StepperValueSlotOptions;
    readonly valueText?: string;
};

export class Stepper extends Disposable {
    public readonly decreaseButton: HTMLButtonElement;
    public readonly element: HTMLElement;
    public readonly increaseButton: HTMLButtonElement;
    public readonly valueElement: HTMLElement;

    private readonly decreaseSlot: StepperActionSlot;
    private readonly increaseSlot: StepperActionSlot;
    private readonly valueSlot: StepperValueSlot;
    private readonly runner = this._register(new ActionRunner());
    private actionRunnerValue: IActionRunner = this.runner;

    public constructor({
        ariaLabel,
        className,
        decrease,
        increase,
        value,
        valueText = "",
    }: StepperOptions) {
        super();

        this.element = document.createElement("div");
        this.element.className = className ? `ui-stepper ${className}` : "ui-stepper";
        this.element.setAttribute("role", "group");
        this.element.setAttribute("aria-label", ariaLabel);

        this.decreaseSlot = this._register(new StepperActionSlot(decrease, (action, context) => this.runAction(action, context)));
        this.valueSlot = this._register(new StepperValueSlot(value, (action, context) => this.runAction(action, context)));
        this.increaseSlot = this._register(new StepperActionSlot(increase, (action, context) => this.runAction(action, context)));

        this.decreaseButton = this.decreaseSlot.element;
        this.valueElement = this.valueSlot.element;
        this.increaseButton = this.increaseSlot.element;
        this.setValue(valueText);
        this.element.append(this.decreaseButton, this.valueElement, this.increaseButton);
    }

    public set actionRunner(actionRunner: IActionRunner) {
        this.actionRunnerValue = actionRunner;
    }

    public get actionRunner(): IActionRunner {
        return this.actionRunnerValue;
    }

    public setAriaLabel(label: string): boolean {
        return setElementAttribute(this.element, "aria-label", label);
    }

    public setValue(value: string): boolean {
        return setText(this.valueElement, value);
    }

    public syncActions(): void {
        this.decreaseSlot.sync();
        this.valueSlot.sync();
        this.increaseSlot.sync();
    }

    public focus(): void {
        const enabledButton = [
            this.decreaseButton,
            this.valueElement,
            this.increaseButton,
        ].find(element => element instanceof HTMLButtonElement && !element.disabled);
        if (enabledButton instanceof HTMLButtonElement) {
            enabledButton.focus();
        }
    }

    public blur(): void {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && this.element.contains(activeElement)) {
            activeElement.blur();
        }
    }

    public override dispose(): void {
        this.element.remove();
        super.dispose();
    }

    private runAction(action: IAction, context: unknown): void {
        void this.actionRunner.run(action, context);
    }
}

export class StepperActionViewItem extends Disposable implements IActionViewItem {
    private runner: IActionRunner | undefined;

    public constructor(
        public readonly action: IAction,
        private readonly stepper: Stepper,
        private readonly className?: string,
    ) {
        super();
    }

    public get actionRunner(): IActionRunner {
        if (!this.runner) {
            this.runner = this._register(new ActionRunner());
        }
        return this.runner;
    }

    public set actionRunner(actionRunner: IActionRunner) {
        this.runner = actionRunner;
        this.stepper.actionRunner = actionRunner;
    }

    public setActionContext(_context: unknown): void {}

    public render(container: HTMLElement): void {
        container.classList.add("ui-actionbar__item");
        if (this.className) {
            container.classList.add(...this.className.split(/\s+/g).filter(Boolean));
        }
        container.setAttribute("role", "presentation");
        container.append(this.stepper.element);
    }

    public isEnabled(): boolean {
        return this.action.enabled;
    }

    public focus(): void {
        this.stepper.focus();
    }

    public blur(): void {
        this.stepper.blur();
    }

    public override dispose(): void {
        this.stepper.element.remove();
        super.dispose();
    }
}

class StepperActionSlot extends Disposable {
    public readonly element: HTMLButtonElement;

    public constructor(
        private readonly options: StepperActionSlotOptions,
        private readonly run: (action: IAction, context: unknown) => void,
    ) {
        super();
        this.element = document.createElement("button");
        this.element.type = "button";
        applyDataset(this.element, options.dataset);
        if (options.keyShortcuts) {
            this.element.setAttribute("aria-keyshortcuts", options.keyShortcuts);
        }
        this._register(addDisposableListener(this.element, EventType.CLICK, event => {
            event.preventDefault();
            event.stopPropagation();
            this.run(this.options.action, event);
        }));
        this.registerActionListener(options.action);
        this.sync();
    }

    public sync(): void {
        syncButtonAction(this.element, this.options.action, {
            baseClassName: "ui-stepper__button",
            className: this.options.className,
            icon: this.options.action.icon ?? this.options.icon,
        });
    }

    private registerActionListener(action: IAction): void {
        if (action instanceof Action) {
            this._register(action.onDidChange(event => this.onActionChanged(event)));
        }
    }

    private onActionChanged(_event: IActionChangeEvent): void {
        this.sync();
    }
}

class StepperValueSlot extends Disposable {
    public readonly element: HTMLElement;

    public constructor(
        private readonly options: StepperValueSlotOptions,
        private readonly run: (action: IAction, context: unknown) => void,
    ) {
        super();
        if (options.kind === "button") {
            const button = document.createElement("button");
            button.type = "button";
            this.element = button;
            this._register(addDisposableListener(button, EventType.CLICK, event => {
                event.preventDefault();
                event.stopPropagation();
                this.run(options.action, event);
            }));
            this.registerActionListener(options.action);
        }
        else {
            this.element = document.createElement("span");
        }

        applyDataset(this.element, options.dataset);
        if (options.live) {
            this.element.setAttribute("aria-live", options.live);
        }
        this.sync();
    }

    public sync(): void {
        if (this.options.kind === "button") {
            syncButtonAction(this.element as HTMLButtonElement, this.options.action, {
                baseClassName: "ui-stepper__value",
                className: this.options.className,
            });
            return;
        }

        this.element.className = this.options.className
            ? `ui-stepper__value ${this.options.className}`
            : "ui-stepper__value";
        if (this.options.label) {
            this.element.setAttribute("aria-label", this.options.label);
        }
    }

    private registerActionListener(action: IAction): void {
        if (action instanceof Action) {
            this._register(action.onDidChange(event => this.onActionChanged(event)));
        }
    }

    private onActionChanged(_event: IActionChangeEvent): void {
        this.sync();
    }
}

const syncButtonAction = (
    button: HTMLButtonElement,
    action: IAction,
    options: {
        readonly baseClassName: string;
        readonly className?: string;
        readonly icon?: LxIconDefinition;
    },
): void => {
    button.className = options.className
        ? `${options.baseClassName} ${options.className}`
        : options.baseClassName;
    if (action.class) {
        button.classList.add(...action.class.split(/\s+/g).filter(Boolean));
    }

    const tooltip = action.tooltip || action.label;
    if (tooltip) {
        button.title = tooltip;
        button.setAttribute("aria-label", tooltip);
    }
    else {
        button.removeAttribute("title");
        button.removeAttribute("aria-label");
    }

    const disabled = !action.enabled;
    button.disabled = disabled;
    button.setAttribute("aria-disabled", `${disabled}`);

    if (options.icon) {
        button.replaceChildren(createLxIcon({
            icon: options.icon,
            size: 14,
        }));
    }
};

const applyDataset = (element: HTMLElement, dataset: StepperDataset | undefined): void => {
    if (!dataset) {
        return;
    }

    for (const [key, value] of Object.entries(dataset)) {
        element.dataset[key] = value;
    }
};

const setElementAttribute = (element: Element, name: string, value: string): boolean => {
    if (element.getAttribute(name) === value) {
        return false;
    }

    element.setAttribute(name, value);
    return true;
};

const setText = (element: HTMLElement, text: string): boolean => {
    if (element.textContent === text) {
        return false;
    }

    element.textContent = text;
    return true;
};
