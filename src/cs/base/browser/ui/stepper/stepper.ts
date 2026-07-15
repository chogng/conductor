/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { BaseActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Action, ActionRunner, type IAction, type IActionChangeEvent, type IActionRunner } from "src/cs/base/common/actions";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { LxIcon } from "src/cs/base/common/lxicon";

import "src/cs/base/browser/ui/stepper/stepper.css";

type StepperDataset = Readonly<Record<string, string>>;

export type StepperActionOptions = {
    readonly action: IAction;
    readonly dataset?: StepperDataset;
    readonly icon?: LxIcon;
    readonly keyShortcuts?: string;
};

export type StepperValueOptions =
    | {
        readonly action: IAction;
        readonly dataset?: StepperDataset;
        readonly kind: "button";
        readonly live?: "polite";
    }
    | {
        readonly dataset?: StepperDataset;
        readonly kind: "text";
        readonly label?: string;
        readonly live?: "polite";
    };

export type StepperOptions = {
    readonly ariaLabel: string;
    readonly decrease: StepperActionOptions;
    readonly increase: StepperActionOptions;
    readonly value: StepperValueOptions;
    readonly valueText?: string;
};

export class Stepper extends Disposable {
    public readonly decreaseButton: HTMLButtonElement;
    public readonly element: HTMLElement;
    public readonly increaseButton: HTMLButtonElement;
    public readonly valueElement: HTMLElement;

    private readonly decreaseAction: StepperActionButton;
    private readonly increaseAction: StepperActionButton;
    private readonly valueControl: StepperValueControl;
    private readonly runner = this._register(new ActionRunner());
    private actionRunnerValue: IActionRunner = this.runner;

    public constructor({
        ariaLabel,
        decrease,
        increase,
        value,
        valueText = "",
    }: StepperOptions) {
        super();

        this.element = document.createElement("div");
        this.element.className = "ui-stepper";
        this.element.setAttribute("role", "group");
        this.element.setAttribute("aria-label", ariaLabel);

        this.decreaseAction = this._register(new StepperActionButton(decrease, "decrease", (action, context) => this.runAction(action, context)));
        this.valueControl = this._register(new StepperValueControl(value, (action, context) => this.runAction(action, context)));
        this.increaseAction = this._register(new StepperActionButton(increase, "increase", (action, context) => this.runAction(action, context)));

        this.decreaseButton = this.decreaseAction.element;
        this.valueElement = this.valueControl.element;
        this.increaseButton = this.increaseAction.element;
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
        this.decreaseAction.sync();
        this.valueControl.sync();
        this.increaseAction.sync();
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

export class StepperActionViewItem extends BaseActionViewItem {
    public readonly stepper: Stepper;

    public constructor(
        action: IAction,
        stepperOptions: StepperOptions,
        options: IActionViewItemOptions = {},
    ) {
        super(undefined, action, options);
        this.stepper = this._register(new Stepper(stepperOptions));
    }

    public override get actionRunner(): IActionRunner {
        return super.actionRunner;
    }

    public override set actionRunner(actionRunner: IActionRunner) {
        super.actionRunner = actionRunner;
        this.stepper.actionRunner = actionRunner;
    }

    public override render(container: HTMLElement): void {
        this.element = container;
        container.classList.add("ui-actionbar__item");
        container.setAttribute("role", "presentation");
        container.append(this.stepper.element);
    }

    public override focus(): void {
        this.stepper.focus();
    }

    public override blur(): void {
        this.stepper.blur();
    }
}

class StepperActionButton extends Disposable {
    public readonly element: HTMLButtonElement;

    public constructor(
        private readonly options: StepperActionOptions,
        private readonly kind: "decrease" | "increase",
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
            classNames: ["ui-stepper__button", `ui-stepper__button--${this.kind}`],
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

class StepperValueControl extends Disposable {
    public readonly element: HTMLElement;

    public constructor(
        private readonly options: StepperValueOptions,
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
                classNames: ["ui-stepper__value"],
            });
            return;
        }

        this.element.className = "ui-stepper__value";
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
        readonly classNames: readonly string[];
        readonly icon?: LxIcon;
    },
): void => {
    button.className = options.classNames.join(" ");
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
