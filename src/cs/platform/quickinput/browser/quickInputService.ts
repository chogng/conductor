import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { createInputBox } from "src/cs/base/browser/ui/inputbox/inputBox";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IInstantiationService, type IInstantiationService as IInstantiationServiceType } from "src/cs/platform/instantiation/common/instantiation";
import { QuickAccessController } from "src/cs/platform/quickinput/browser/quickAccess";
import type { IQuickAccessController } from "src/cs/platform/quickinput/common/quickAccess";
import {
  IQuickInputService,
  ItemActivation,
  NO_KEY_MODS,
  type IKeyMods,
  type IQuickInputButton,
  type IQuickNavigateConfiguration,
  type IQuickPick,
  type IQuickPickDidAcceptEvent,
  type IQuickPickItem,
  type IQuickPickItemButtonEvent,
  type IQuickPickSeparator,
  type IQuickPickSeparatorButtonEvent,
  type IQuickPickWillAcceptEvent,
  type IQuickInputService as IQuickInputServiceType,
  type QuickPickInput,
  type QuickPickItem,
  type QuickPickOptions,
} from "src/cs/platform/quickinput/common/quickInput";

type AnyQuickPick = BrowserQuickPick<IQuickPickItem, { useSeparators: boolean }>;
type QuickPickElement = QuickPickInput<IQuickPickItem>;

type ActiveQuickPick = {
  readonly controller: AbortController;
  readonly input: HTMLInputElement;
  readonly list: HTMLElement;
  readonly overlay: HTMLElement;
  readonly picker: AnyQuickPick;
  readonly scrollbar: Scrollbar;
  activeIndex: number;
  visibleItems: readonly QuickPickElement[];
};

export class BrowserQuickInputService extends Disposable implements IQuickInputServiceType {
  public declare readonly _serviceBrand: undefined;

  private quickAccessController: IQuickAccessController | undefined;
  public get quickAccess(): IQuickAccessController {
    if (!this.quickAccessController) {
      this.quickAccessController = this._register(this.instantiationService.createInstance(QuickAccessController));
    }

    return this.quickAccessController;
  }

  private activeQuickPick: ActiveQuickPick | null = null;

  public constructor(
    @IInstantiationService private readonly instantiationService: IInstantiationServiceType,
  ) {
    super();
  }

  public pick<T extends IQuickPickItem>(options: QuickPickOptions<T>): Promise<T | undefined> {
    const picker = this.createQuickPick<T>();
    picker.ariaLabel = options.ariaLabel ?? localize("quickInput.ariaLabel", "Quick input");
    picker.emptyText = options.emptyText;
    picker.placeholder = options.placeholder;
    picker.items = options.items;
    picker.value = options.value ?? "";

    return new Promise<T | undefined>(resolve => {
      const store = new DisposableStore();
      let accepted = false;

      store.add(picker.onDidAccept(() => {
        accepted = true;
        resolve(picker.selectedItems[0]);
      }));
      store.add(picker.onDidHide(() => {
        if (!accepted) {
          resolve(undefined);
        }
        store.dispose();
        picker.dispose();
      }));

      picker.show();
    });
  }

  public createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
  public createQuickPick<T extends IQuickPickItem>(options?: { useSeparators?: false }): IQuickPick<T, { useSeparators: false }>;
  public createQuickPick<T extends IQuickPickItem>(
    options: { useSeparators?: boolean } = {},
  ): IQuickPick<T, { useSeparators: boolean }> {
    return new BrowserQuickPick<T, { useSeparators: boolean }>(this, !!options.useSeparators);
  }

  public override dispose(): void {
    this.activeQuickPick?.picker.hide();
    super.dispose();
  }

  public showQuickPick(picker: AnyQuickPick): void {
    this.activeQuickPick?.picker.hide();

    const controller = new AbortController();
    const overlay = document.createElement("div");
    overlay.className = "quick-input-overlay";
    overlay.setAttribute("role", "presentation");

    const panel = document.createElement("div");
    panel.className = "quick-input-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", picker.ariaLabel ?? localize("quickInput.ariaLabel", "Quick input"));

    const input = createInputBox({
      ariaLabel: picker.ariaLabel ?? localize("quickInput.inputAriaLabel", "Quick input"),
      inputClassName: "quick-input-input",
      placeholder: picker.placeholder,
      type: "text",
      value: picker.value,
    });

    const scrollbar = new Scrollbar({
      className: "quick-input-scroll-area",
      viewportClassName: "quick-input-list",
    });
    const list = scrollbar.viewport;
    list.setAttribute("role", "listbox");

    panel.append(input, scrollbar.element);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const activeQuickPick: ActiveQuickPick = {
      activeIndex: 0,
      controller,
      input,
      list,
      overlay,
      picker,
      scrollbar,
      visibleItems: [],
    };
    this.activeQuickPick = activeQuickPick;

    overlay.addEventListener("mousedown", event => {
      if (event.target === overlay) {
        picker.hide();
      }
    }, { signal: controller.signal });
    input.addEventListener("input", () => {
      picker.setValueFromInput(input.value);
    }, { signal: controller.signal });
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        picker.hide();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveActiveItem(activeQuickPick, 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveActiveItem(activeQuickPick, -1);
        return;
      }

      if (event.key === "Enter") {
        const item = getItem(activeQuickPick.visibleItems[activeQuickPick.activeIndex]);
        if (item) {
          event.preventDefault();
          picker.setSelectedItems([item]);
          picker.accept(getKeyMods(event));
        }
      }
    }, { signal: controller.signal });

    this.refreshQuickPick(picker);
    if (!picker.hideInput) {
      input.focus();
      applyValueSelection(input, picker.valueSelection);
    }
  }

  public hideQuickPick(picker: AnyQuickPick): void {
    const activeQuickPick = this.activeQuickPick;
    if (!activeQuickPick || activeQuickPick.picker !== picker) {
      return;
    }

    this.activeQuickPick = null;
    activeQuickPick.controller.abort();
    activeQuickPick.scrollbar.dispose();
    activeQuickPick.overlay.remove();
    picker.fireDidHide();
  }

  public refreshQuickPick(picker: AnyQuickPick): void {
    const activeQuickPick = this.activeQuickPick;
    if (!activeQuickPick || activeQuickPick.picker !== picker) {
      return;
    }

    activeQuickPick.input.placeholder = picker.placeholder ?? "";
    activeQuickPick.input.style.display = picker.hideInput ? "none" : "";
    if (activeQuickPick.input.value !== picker.value) {
      activeQuickPick.input.value = picker.value;
      applyValueSelection(activeQuickPick.input, picker.valueSelection);
    }

    this.render(activeQuickPick);
  }

  private moveActiveItem(
    activeQuickPick: ActiveQuickPick,
    offset: number,
  ): void {
    const nextIndex = findNextItemIndex(activeQuickPick.visibleItems, activeQuickPick.activeIndex, offset);
    if (nextIndex < 0) {
      return;
    }

    activeQuickPick.activeIndex = nextIndex;
    this.render(activeQuickPick, true);
  }

  private render(
    activeQuickPick: ActiveQuickPick,
    preserveActiveIndex = false,
  ): void {
    const picker = activeQuickPick.picker;
    const visibleItems = getVisibleItems(picker.getItems(), picker.value, picker);
    activeQuickPick.visibleItems = visibleItems;
    activeQuickPick.activeIndex = getActiveIndex(
      visibleItems,
      picker.activeItems[0],
      preserveActiveIndex ? activeQuickPick.activeIndex : undefined,
      picker.itemActivation,
    );

    const activeItem = getItem(visibleItems[activeQuickPick.activeIndex]);
    picker.setActiveItemsFromService(activeItem ? [activeItem] : []);
    activeQuickPick.list.replaceChildren();

    if (!visibleItems.length) {
      const empty = document.createElement("div");
      empty.className = "quick-input-empty";
      empty.textContent = picker.busy
        ? localize("quickInput.busy", "Loading...")
        : picker.emptyText ?? localize("quickInput.empty", "No results found");
      activeQuickPick.list.appendChild(empty);
      activeQuickPick.scrollbar.layout();
      return;
    }

    for (const [index, item] of visibleItems.entries()) {
      if (isQuickPickSeparator(item)) {
        activeQuickPick.list.appendChild(this.renderSeparator(item, picker));
        continue;
      }

      activeQuickPick.list.appendChild(this.renderItem(activeQuickPick, item, index));
    }

    activeQuickPick.list.querySelector(".quick-input-item-active")?.scrollIntoView({
      block: "nearest",
    });
    activeQuickPick.scrollbar.layout();
  }

  private renderSeparator(separator: IQuickPickSeparator, picker: AnyQuickPick): HTMLElement {
    const element = document.createElement("div");
    element.className = "quick-input-separator";
    element.textContent = separator.label ?? "";

    appendButtons(element, separator.buttons, (button, buttonIndex, event) => {
      picker.triggerSeparatorButton(separator, button, buttonIndex, getKeyMods(event));
    });

    return element;
  }

  private renderItem(activeQuickPick: ActiveQuickPick, item: IQuickPickItem, index: number): HTMLElement {
    const picker = activeQuickPick.picker;
    const element = document.createElement("div");
    element.className = "quick-input-item";
    element.dataset.quickPickItemId = item.id;
    element.setAttribute("role", "option");
    element.setAttribute("aria-label", item.ariaLabel ?? item.label);
    element.setAttribute("aria-selected", index === activeQuickPick.activeIndex ? "true" : "false");
    if (index === activeQuickPick.activeIndex) {
      element.classList.add("quick-input-item-active");
    }

    const label = document.createElement("span");
    label.className = "quick-input-item-label";
    label.textContent = item.label;

    const hint = document.createElement("span");
    hint.className = "quick-input-item-hint";
    hint.textContent = item.keybinding ?? item.description ?? item.detail ?? item.id;

    element.append(label, hint);
    appendButtons(element, item.buttons, (buttonItem, buttonIndex, event) => {
      picker.triggerItemButton(item, buttonItem, buttonIndex, getKeyMods(event));
    });
    element.addEventListener("mouseenter", () => {
      activeQuickPick.activeIndex = index;
      picker.setActiveItemsFromService([item]);
      this.render(activeQuickPick, true);
    });
    element.addEventListener("click", event => {
      picker.setSelectedItems([item]);
      picker.accept(getKeyMods(event));
    });
    return element;
  }
}

class BrowserQuickPick<T extends IQuickPickItem, O extends { useSeparators: boolean }>
  extends Disposable implements IQuickPick<T, O> {

  private readonly onDidChangeValueEmitter = this._register(new Emitter<string>());
  private readonly onWillAcceptEmitter = this._register(new Emitter<IQuickPickWillAcceptEvent>());
  private readonly onDidAcceptEmitter = this._register(new Emitter<IQuickPickDidAcceptEvent>());
  private readonly onDidHideEmitter = this._register(new Emitter<void>());
  private readonly onDidTriggerItemButtonEmitter = this._register(new Emitter<IQuickPickItemButtonEvent<T>>());
  private readonly onDidTriggerSeparatorButtonEmitter = this._register(new Emitter<IQuickPickSeparatorButtonEvent>());

  public readonly onDidChangeValue = this.onDidChangeValueEmitter.event;
  public readonly onWillAccept = this.onWillAcceptEmitter.event;
  public readonly onDidAccept = this.onDidAcceptEmitter.event;
  public readonly onDidHide = this.onDidHideEmitter.event;
  public readonly onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;
  public readonly onDidTriggerSeparatorButton = this.onDidTriggerSeparatorButtonEmitter.event;

  private valueValue = "";
  private itemsValue: readonly QuickPickInput<T>[] = [];
  private activeItemsValue: readonly T[] = [];
  private selectedItemsValue: readonly T[] = [];

  public valueSelection: [number, number] | undefined;
  public placeholder: string | undefined;
  public emptyText: string | undefined;
  public ariaLabel: string | undefined;
  public quickNavigate: IQuickNavigateConfiguration | undefined;
  public hideInput = false;
  public itemActivation = ItemActivation.FIRST;
  public contextKey: string | undefined;
  public filterValue: ((value: string) => string) | undefined;
  public busy = false;
  public canAcceptInBackground = false;
  public matchOnLabel = true;
  public matchOnDescription = true;
  public matchOnDetail = true;
  public sortByLabel = false;

  public constructor(
    private readonly quickInputService: BrowserQuickInputService,
    private readonly useSeparators: boolean,
  ) {
    super();
  }

  public get value(): string {
    return this.valueValue;
  }

  public set value(value: string) {
    if (this.valueValue === value) {
      return;
    }

    this.valueValue = value;
    this.onDidChangeValueEmitter.fire(value);
    this.refresh();
  }

  public get items(): O extends { useSeparators: true } ? ReadonlyArray<T | IQuickPickSeparator> : ReadonlyArray<T> {
    return this.itemsValue as O extends { useSeparators: true } ? ReadonlyArray<T | IQuickPickSeparator> : ReadonlyArray<T>;
  }

  public set items(items: O extends { useSeparators: true } ? ReadonlyArray<T | IQuickPickSeparator> : ReadonlyArray<T>) {
    this.itemsValue = this.useSeparators
      ? [...(items as ReadonlyArray<T | IQuickPickSeparator>)]
      : (items as ReadonlyArray<T>).filter(item => !isQuickPickSeparator(item));
    this.refresh();
  }

  public get activeItems(): readonly T[] {
    return this.activeItemsValue;
  }

  public set activeItems(items: readonly T[]) {
    this.activeItemsValue = [...items];
    this.refresh();
  }

  public get selectedItems(): readonly T[] {
    return this.selectedItemsValue;
  }

  public getItems(): readonly QuickPickInput<T>[] {
    return this.itemsValue;
  }

  public setValueFromInput(value: string): void {
    if (this.valueValue === value) {
      return;
    }

    this.valueValue = value;
    this.onDidChangeValueEmitter.fire(value);
    this.refresh();
  }

  public setActiveItemsFromService(items: readonly IQuickPickItem[]): void {
    this.activeItemsValue = items as readonly T[];
  }

  public setSelectedItems(items: readonly IQuickPickItem[]): void {
    this.selectedItemsValue = items as readonly T[];
  }

  public accept(keyMods: IKeyMods = NO_KEY_MODS): void {
    let vetoed = false;
    this.onWillAcceptEmitter.fire({
      keyMods,
      veto: () => {
        vetoed = true;
      },
    });
    if (vetoed) {
      return;
    }

    if (!this.selectedItemsValue.length && this.activeItemsValue.length) {
      this.selectedItemsValue = [this.activeItemsValue[0]];
    }

    this.onDidAcceptEmitter.fire({
      inBackground: false,
      keyMods,
    });
    this.hide();
  }

  public triggerItemButton(
    item: IQuickPickItem,
    button: IQuickInputButton,
    buttonIndex: number,
    keyMods: IKeyMods,
  ): void {
    this.onDidTriggerItemButtonEmitter.fire({
      button,
      buttonIndex,
      item: item as T,
      keyMods,
    });
  }

  public triggerSeparatorButton(
    separator: IQuickPickSeparator,
    button: IQuickInputButton,
    buttonIndex: number,
    keyMods: IKeyMods,
  ): void {
    this.onDidTriggerSeparatorButtonEmitter.fire({
      button,
      buttonIndex,
      keyMods,
      separator,
    });
  }

  public show(): void {
    this.quickInputService.showQuickPick(this as unknown as AnyQuickPick);
  }

  public hide(): void {
    this.quickInputService.hideQuickPick(this as unknown as AnyQuickPick);
  }

  public fireDidHide(): void {
    this.onDidHideEmitter.fire();
  }

  public override dispose(): void {
    this.hide();
    super.dispose();
  }

  private refresh(): void {
    this.quickInputService.refreshQuickPick(this as unknown as AnyQuickPick);
  }
}

const getVisibleItems = (
  items: readonly QuickPickElement[],
  value: string,
  picker: AnyQuickPick,
): readonly QuickPickElement[] => {
  const normalizedFilter = (picker.filterValue?.(value) ?? value).trim().toLowerCase();
  if (!normalizedFilter || !hasPickerFiltering(picker)) {
    return items;
  }

  return cleanSeparators(items.filter(item => {
    if (isQuickPickSeparator(item)) {
      return true;
    }

    const searchable = [
      picker.matchOnLabel ? item.label : "",
      picker.matchOnDescription ? item.description ?? "" : "",
      picker.matchOnDetail ? item.detail ?? "" : "",
      item.id,
    ].join(" ").toLowerCase();
    return searchable.includes(normalizedFilter);
  }));
};

const hasPickerFiltering = (picker: AnyQuickPick): boolean =>
  picker.matchOnLabel || picker.matchOnDescription || picker.matchOnDetail;

const cleanSeparators = (items: readonly QuickPickElement[]): readonly QuickPickElement[] => {
  const result: QuickPickElement[] = [];
  for (const item of items) {
    if (isQuickPickSeparator(item)) {
      if (!result.length || isQuickPickSeparator(result[result.length - 1])) {
        continue;
      }
    }
    result.push(item);
  }

  while (result.length && isQuickPickSeparator(result[result.length - 1])) {
    result.pop();
  }

  return result;
};

const getActiveIndex = (
  items: readonly QuickPickElement[],
  activeItem: IQuickPickItem | undefined,
  preservedIndex: number | undefined,
  itemActivation: ItemActivation,
): number => {
  if (activeItem) {
    const index = items.indexOf(activeItem);
    if (index >= 0) {
      return index;
    }
  }

  if (typeof preservedIndex === "number" && getItem(items[preservedIndex])) {
    return preservedIndex;
  }

  const itemIndexes = items
    .map((item, index) => getItem(item) ? index : -1)
    .filter(index => index >= 0);
  if (!itemIndexes.length) {
    return 0;
  }

  if (itemActivation === ItemActivation.SECOND && itemIndexes.length > 1) {
    return itemIndexes[1];
  }

  if (itemActivation === ItemActivation.LAST) {
    return itemIndexes[itemIndexes.length - 1];
  }

  if (itemActivation === ItemActivation.NONE) {
    return -1;
  }

  return itemIndexes[0];
};

const findNextItemIndex = (
  items: readonly QuickPickElement[],
  activeIndex: number,
  offset: number,
): number => {
  const itemCount = items.filter(item => Boolean(getItem(item))).length;
  if (itemCount === 0) {
    return -1;
  }

  let nextIndex = activeIndex;
  for (let step = 0; step < items.length; step += 1) {
    nextIndex = (nextIndex + offset + items.length) % items.length;
    if (getItem(items[nextIndex])) {
      return nextIndex;
    }
  }

  return -1;
};

const appendButtons = (
  parent: HTMLElement,
  buttons: readonly IQuickInputButton[] | undefined,
  fire: (button: IQuickInputButton, buttonIndex: number, event: MouseEvent) => void,
): void => {
  if (!buttons?.length) {
    return;
  }

  const actions = document.createElement("span");
  actions.className = "quick-input-item-actions";
  for (const [buttonIndex, button] of buttons.entries()) {
    const action = document.createElement("button");
    action.className = button.iconClass ? `quick-input-item-button ${button.iconClass}` : "quick-input-item-button";
    action.type = "button";
    action.title = button.tooltip ?? "";
    action.textContent = button.tooltip ? button.tooltip.slice(0, 1) : "";
    action.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      fire(button, buttonIndex, event);
    });
    actions.appendChild(action);
  }
  parent.appendChild(actions);
};

const applyValueSelection = (
  input: HTMLInputElement,
  selection: [number, number] | undefined,
): void => {
  if (!selection) {
    return;
  }

  input.setSelectionRange(selection[0], selection[1]);
};

const getKeyMods = (event: MouseEvent | KeyboardEvent): IKeyMods => ({
  alt: event.altKey,
  ctrlCmd: event.ctrlKey || event.metaKey,
});

const isQuickPickSeparator = (item: unknown): item is IQuickPickSeparator =>
  typeof item === "object" && item !== null && (item as IQuickPickSeparator).type === "separator";

const getItem = (item: QuickPickElement | undefined): IQuickPickItem | undefined =>
  item && !isQuickPickSeparator(item) ? item : undefined;

registerSingleton(IQuickInputService, BrowserQuickInputService, InstantiationType.Delayed);
