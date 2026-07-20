import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ContextView } from "src/cs/base/browser/ui/contextview/contextview";
import { Dropdown } from "src/cs/base/browser/ui/dropdown/dropdown";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";

import "src/cs/base/browser/ui/selectBox/selectBox.css";

const SELECTBOX_DROPDOWN_WIDTH = "--ui-selectbox-dropdown-width";

export type SelectBoxOption<T extends string> = {
    readonly disabled?: boolean;
    readonly label: string;
    readonly value: T;
};

export type SelectBoxOptions<T extends string> = {
    readonly ariaLabel?: string;
    readonly ariaLabelledBy?: string;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly id?: string;
    readonly matchAnchorWidth?: boolean;
    readonly options: readonly SelectBoxOption<T>[];
    readonly dropdownClassName?: string;
    readonly dropdownZIndex?: number;
    readonly value: T;
};

export class SelectBox<T extends string> extends Disposable {
    private readonly button: HTMLButtonElement;
    private readonly contentView: ContextView;
    private readonly dropdown: Dropdown;
    private readonly onDidSelectEmitter = this._register(new Emitter<T>());
    private readonly optionDisposables = this._register(new DisposableStore());
    private options: SelectBoxOptions<T>;

    constructor(options: SelectBoxOptions<T>) {
        super();
        this.options = options;
        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.setAttribute("aria-haspopup", "listbox");

        this.contentView = this._register(new ContextView({
            anchor: this.button,
            className: getDropdownClassName(options.dropdownClassName),
            matchAnchorWidth: options.matchAnchorWidth ?? true,
            render: container => this.renderOptions(container),
            role: "listbox",
            zIndex: options.dropdownZIndex,
        }));

        this.dropdown = this._register(new Dropdown({
            anchor: this.button,
            content: this.contentView.domNode,
            onDidChangeVisibility: visible => {
                this.button.setAttribute("aria-expanded", visible ? "true" : "false");
                if (visible) {
                    this.syncDropdownWidth();
                    this.contentView.show();
                    this.focusSelectedOption();
                    return;
                }

                this.optionDisposables.clear();
                this.contentView.domNode.style.removeProperty(SELECTBOX_DROPDOWN_WIDTH);
                this.contentView.hide();
            },
        }));

        this._register(addDisposableListener(this.button, EventType.CLICK, event => {
            event.preventDefault();
            event.stopPropagation();
            this.dropdown.toggle();
        }));
        this._register(addDisposableListener(this.button, EventType.KEY_DOWN, event => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            this.dropdown.show();
        }));

        this.renderButton();
        this.syncDropdownWidth();
    }

    public get domNode(): HTMLButtonElement {
        return this.button;
    }

    public readonly onDidSelect = this.onDidSelectEmitter.event;

    public setOptions(options: readonly SelectBoxOption<T>[], value: T): void {
        this.options = { ...this.options, options, value };
        this.renderButton();
        this.syncOptionSelection();
        this.syncDropdownWidth();
        this.contentView.update({
            render: container => this.renderOptions(container),
        });
    }

    public select(value: T): void {
        if (this.options.value === value) {
            return;
        }

        this.options = { ...this.options, value };
        this.renderButton();
        this.syncOptionSelection();
    }

    public setEnabled(enabled: boolean): void {
        if (this.options.disabled === !enabled) {
            return;
        }

        this.options = { ...this.options, disabled: !enabled };
        if (!enabled) {
            this.dropdown.hide();
        }
        this.renderButton();
    }

    public hide(): void {
        this.dropdown.hide();
    }

    private renderButton(): void {
        const selected = getSelectedOption(this.options.options, this.options.value);
        this.button.className = getButtonClassName(this.options.className);
        this.button.disabled = this.options.disabled === true;
        this.button.setAttribute("aria-expanded", this.dropdown.isVisible() ? "true" : "false");

        if (this.options.id) {
            this.button.id = this.options.id;
        }
        if (this.options.ariaLabel) {
            this.button.setAttribute("aria-label", this.options.ariaLabel);
        }
        else {
            this.button.removeAttribute("aria-label");
        }
        if (this.options.ariaLabelledBy) {
            this.button.setAttribute("aria-labelledby", this.options.ariaLabelledBy);
        }
        else {
            this.button.removeAttribute("aria-labelledby");
        }

        const label = document.createElement("span");
        label.className = "ui-selectbox__label";
        label.textContent = selected?.label ?? "";

        const icon = document.createElement("span");
        icon.className = "ui-selectbox__icon";
        icon.append(createLxIcon({ icon: LxIcon.chevronDown, size: 14 }));

        this.button.replaceChildren(label, icon);
    }

    private renderOptions(container: HTMLElement): void {
        this.optionDisposables.clear();
        container.classList.add("ui-selectbox__dropdown");
        this.syncDropdownWidth();

        const list = document.createElement("div");
        list.className = "ui-selectbox__list";
        for (const option of this.options.options) {
            list.append(this.createOptionButton(option));
        }
        container.replaceChildren(list);
    }

    private createOptionButton(option: SelectBoxOption<T>): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ui-selectbox__option";
        button.disabled = option.disabled === true;
        button.classList.toggle("selected", option.value === this.options.value);
        button.dataset.value = option.value;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", option.value === this.options.value ? "true" : "false");
        button.textContent = option.label;

        this.optionDisposables.add(addDisposableListener(button, EventType.CLICK, event => {
            event.preventDefault();
            event.stopPropagation();
            this.selectOption(option);
        }));
        this.optionDisposables.add(addDisposableListener(button, EventType.KEY_DOWN, event => {
            this.handleOptionKeyDown(event, button, option);
        }));

        return button;
    }

    private handleOptionKeyDown(event: KeyboardEvent, button: HTMLButtonElement, option: SelectBoxOption<T>): void {
        if (event.key === "Escape") {
            event.preventDefault();
            this.dropdown.hide();
            this.button.focus();
            return;
        }
        if (event.key === "Tab") {
            this.dropdown.hide();
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.selectOption(option);
            return;
        }

        const options = Array.from(
            this.contentView.domNode.querySelectorAll<HTMLButtonElement>(".ui-selectbox__option:not(:disabled)"),
        );
        const index = options.indexOf(button);
        if (index < 0) {
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            options[Math.min(index + 1, options.length - 1)]?.focus();
        }
        else if (event.key === "ArrowUp") {
            event.preventDefault();
            options[Math.max(index - 1, 0)]?.focus();
        }
        else if (event.key === "Home") {
            event.preventDefault();
            options[0]?.focus();
        }
        else if (event.key === "End") {
            event.preventDefault();
            options[options.length - 1]?.focus();
        }
    }

    private selectOption(option: SelectBoxOption<T>): void {
        if (option.disabled) {
            return;
        }

        const changed = this.options.value !== option.value;
        this.select(option.value);
        if (changed) {
            this.onDidSelectEmitter.fire(option.value);
        }
        this.dropdown.hide();
        this.button.focus();
    }

    private focusSelectedOption(): void {
        requestAnimationFrame(() => {
            const selected = this.contentView.domNode.querySelector<HTMLButtonElement>(
                ".ui-selectbox__option.selected:not(:disabled)",
            );
            const first = this.contentView.domNode.querySelector<HTMLButtonElement>(".ui-selectbox__option:not(:disabled)");
            (selected ?? first)?.focus();
        });
    }

    private syncOptionSelection(): void {
        const optionButtons = this.contentView.domNode.querySelectorAll<HTMLButtonElement>(".ui-selectbox__option");
        for (const button of optionButtons) {
            const selected = button.dataset.value === this.options.value;
            button.classList.toggle("selected", selected);
            button.setAttribute("aria-selected", selected ? "true" : "false");
        }
    }

    private syncDropdownWidth(): void {
        if (this.options.matchAnchorWidth === false) {
            this.contentView.domNode.style.removeProperty(SELECTBOX_DROPDOWN_WIDTH);
            return;
        }

        const width = Math.round(this.button.offsetWidth);
        if (width > 0) {
            this.contentView.domNode.style.setProperty(SELECTBOX_DROPDOWN_WIDTH, `${width}px`);
        }
    }

}

export function createSelectBox<T extends string>(options: SelectBoxOptions<T>): SelectBox<T> {
    return new SelectBox(options);
}

function getSelectedOption<T extends string>(
    options: readonly SelectBoxOption<T>[],
    value: T,
): SelectBoxOption<T> | undefined {
    return options.find(option => option.value === value);
}

function getButtonClassName(className: string | undefined): string {
    return className ? `ui-selectbox ${className}` : "ui-selectbox";
}

function getDropdownClassName(className: string | undefined): string {
    return className ?? "";
}
