import { asCssValueWithDefault } from "../../cssValue.js";
import type { IDragAndDropData } from "../../dnd.js";
import { addDisposableListener, EventType, getWindow, isEditableElement, isHTMLElement } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { StandardKeyboardEvent, type IKeyboardEvent } from "../../keyboardEvent.js";
import { StandardMouseEvent } from "../../mouseEvent.js";
import { alert as ariaAlert, type AriaRole } from "../aria/aria.js";
import { distinct, equals, range } from "../../../common/arrays.js";
import { memoize } from "../../../common/decorators.js";
import { Event, Emitter, EventBufferer, type Event as BaseEvent } from "../../../common/event.js";
import { matchesFuzzy2, matchesPrefix } from "../../../common/filters.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore, type IDisposable } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import type { ISpliceable } from "../../../common/sequence.js";
import { type IIdentityProvider, type IListDragAndDrop, type IListDragOverReaction, type IKeyboardNavigationDelegate, type IKeyboardNavigationLabelProvider, type IListContextMenuEvent, type IListEvent, type IListGestureEvent, type IListMouseEvent, type IListRenderer, type IListTouchEvent, type IListVirtualDelegate, ListError, NotSelectableGroupId, type NotSelectableGroupIdType } from "./list.js";
import { ListView, type IListViewAccessibilityProvider, type IListViewDragAndDrop, type IListViewOptions, type IListViewOptionsUpdate, ListViewTargetSector } from "./listView.js";
import { CombinedSpliceable } from "./splice.js";

export enum TypeNavigationMode {
  Automatic,
  Trigger,
}

const enum TypeNavigationControllerState {
  Idle,
  Typing,
}

export interface IKeyboardNavigationEventFilter {
  (event: StandardKeyboardEvent): boolean;
}

export interface IMultipleSelectionController<T> {
  isSelectionSingleChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean;
  isSelectionRangeChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean;
}

export interface IListStyles {
  readonly listBackground: string | undefined;
  readonly listFocusBackground: string | undefined;
  readonly listFocusForeground: string | undefined;
  readonly listActiveSelectionBackground: string | undefined;
  readonly listActiveSelectionForeground: string | undefined;
  readonly listActiveSelectionIconForeground: string | undefined;
  readonly listFocusAndSelectionOutline: string | undefined;
  readonly listFocusAndSelectionBackground: string | undefined;
  readonly listFocusAndSelectionForeground: string | undefined;
  readonly listInactiveSelectionBackground: string | undefined;
  readonly listInactiveSelectionIconForeground: string | undefined;
  readonly listInactiveSelectionForeground: string | undefined;
  readonly listInactiveFocusForeground: string | undefined;
  readonly listInactiveFocusBackground: string | undefined;
  readonly listHoverBackground: string | undefined;
  readonly listHoverForeground: string | undefined;
  readonly listDropOverBackground: string | undefined;
  readonly listDropBetweenBackground: string | undefined;
  readonly listFocusOutline: string | undefined;
  readonly listInactiveFocusOutline: string | undefined;
  readonly listSelectionOutline: string | undefined;
  readonly listHoverOutline: string | undefined;
  readonly treeIndentGuidesStroke: string | undefined;
  readonly treeInactiveIndentGuidesStroke: string | undefined;
  readonly treeStickyScrollBackground: string | undefined;
  readonly treeStickyScrollBorder: string | undefined;
  readonly treeStickyScrollShadow: string | undefined;
  readonly tableColumnsBorder: string | undefined;
  readonly tableOddRowsBackgroundColor: string | undefined;
}

class DefaultStyleController {
  public constructor(
    private readonly styleElement: HTMLStyleElement,
    private readonly selectorSuffix: string,
  ) {}

  public style(styles: IListStyles): void {
    const suffix = this.selectorSuffix ? `.${this.selectorSuffix}` : "";
    const list = `.ui-list${suffix}`;
    const row = `${list} .ui-list__row`;
    const content: string[] = [];

    if (styles.listBackground) {
      content.push(`${list} .ui-list__stage { background: ${styles.listBackground}; }`);
    }
    if (styles.listFocusBackground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--focused { background-color: ${styles.listFocusBackground}; }`);
      content.push(`${list}:focus-within ${row}.ui-list__row--focused:hover { background-color: ${styles.listFocusBackground}; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--focused { color: ${styles.listFocusForeground}; }`);
    }
    if (styles.listActiveSelectionBackground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--selected { background-color: ${styles.listActiveSelectionBackground}; }`);
      content.push(`${list}:focus-within ${row}.ui-list__row--selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`);
    }
    if (styles.listActiveSelectionForeground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--selected { color: ${styles.listActiveSelectionForeground}; }`);
    }
    if (styles.listActiveSelectionIconForeground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--selected .codicon { color: ${styles.listActiveSelectionIconForeground}; }`);
    }
    if (styles.listFocusAndSelectionBackground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--selected.ui-list__row--focused { background-color: ${styles.listFocusAndSelectionBackground}; }`);
    }
    if (styles.listFocusAndSelectionForeground) {
      content.push(`${list}:focus-within ${row}.ui-list__row--selected.ui-list__row--focused { color: ${styles.listFocusAndSelectionForeground}; }`);
    }
    if (styles.listInactiveFocusForeground) {
      content.push(`${row}.ui-list__row--focused { color: ${styles.listInactiveFocusForeground}; }`);
      content.push(`${row}.ui-list__row--focused:hover { color: ${styles.listInactiveFocusForeground}; }`);
    }
    if (styles.listInactiveSelectionIconForeground) {
      content.push(`${row}.ui-list__row--focused .codicon { color: ${styles.listInactiveSelectionIconForeground}; }`);
    }
    if (styles.listInactiveFocusBackground) {
      content.push(`${row}.ui-list__row--focused { background-color: ${styles.listInactiveFocusBackground}; }`);
      content.push(`${row}.ui-list__row--focused:hover { background-color: ${styles.listInactiveFocusBackground}; }`);
    }
    if (styles.listInactiveSelectionBackground) {
      content.push(`${row}.ui-list__row--selected { background-color: ${styles.listInactiveSelectionBackground}; }`);
      content.push(`${row}.ui-list__row--selected:hover { background-color: ${styles.listInactiveSelectionBackground}; }`);
    }
    if (styles.listInactiveSelectionForeground) {
      content.push(`${row}.ui-list__row--selected { color: ${styles.listInactiveSelectionForeground}; }`);
    }
    if (styles.listHoverBackground) {
      content.push(`${list}:not(.drop-target):not(.dragging) ${row}:hover:not(.ui-list__row--selected):not(.ui-list__row--focused) { background-color: ${styles.listHoverBackground}; }`);
    }
    if (styles.listHoverForeground) {
      content.push(`${list}:not(.drop-target):not(.dragging) ${row}:hover:not(.ui-list__row--selected):not(.ui-list__row--focused) { color: ${styles.listHoverForeground}; }`);
    }

    const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ""));
    if (focusAndSelectionOutline) {
      content.push(`${list}:focus-within ${row}.ui-list__row--focused.ui-list__row--selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listFocusOutline) {
      content.push(`${list}:focus-within ${row}.ui-list__row--focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
    }
    const inactiveFocusAndSelectionOutline = asCssValueWithDefault(styles.listSelectionOutline, styles.listInactiveFocusOutline ?? "");
    if (inactiveFocusAndSelectionOutline) {
      content.push(`${row}.ui-list__row--focused.ui-list__row--selected { outline: 1px dotted ${inactiveFocusAndSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listSelectionOutline) {
      content.push(`${row}.ui-list__row--selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listInactiveFocusOutline) {
      content.push(`${row}.ui-list__row--focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
    }
    if (styles.listHoverOutline) {
      content.push(`${row}:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
    }
    if (styles.listDropOverBackground) {
      content.push(`${list}.drop-target, ${list} .ui-list__stage.drop-target, ${row}.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }`);
    }
    if (styles.listDropBetweenBackground) {
      content.push(`${list} .ui-list__stage.drop-target-before .ui-list__row:first-child::before, ${row}.drop-target-before::before { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 1px; background-color: ${styles.listDropBetweenBackground}; }`);
      content.push(`${list} .ui-list__stage.drop-target-after .ui-list__row:last-child::after, ${row}.drop-target-after::after { content: ""; position: absolute; bottom: 0; left: 0; width: 100%; height: 1px; background-color: ${styles.listDropBetweenBackground}; }`);
    }
    if (styles.tableColumnsBorder) {
      content.push(`${list} .ui-table-columns { border-color: ${styles.tableColumnsBorder}; }`);
    }
    if (styles.tableOddRowsBackgroundColor) {
      content.push(`${row}[data-parity=odd]:not(.ui-list__row--focused):not(.ui-list__row--selected):not(:hover) { background-color: ${styles.tableOddRowsBackgroundColor}; }`);
    }

    this.styleElement.textContent = content.join("\n");
  }
}

export const unthemedListStyles: IListStyles = {
  listActiveSelectionBackground: "#0E639C",
  listActiveSelectionForeground: "#FFFFFF",
  listActiveSelectionIconForeground: "#FFFFFF",
  listBackground: undefined,
  listDropBetweenBackground: "#EEEEEE",
  listDropOverBackground: "#383B3D",
  listFocusAndSelectionBackground: "#094771",
  listFocusAndSelectionForeground: "#FFFFFF",
  listFocusAndSelectionOutline: "#90C2F9",
  listFocusBackground: "#7FB0D0",
  listFocusForeground: undefined,
  listFocusOutline: undefined,
  listHoverBackground: "#2A2D2E",
  listHoverForeground: undefined,
  listHoverOutline: undefined,
  listInactiveFocusBackground: undefined,
  listInactiveFocusForeground: undefined,
  listInactiveFocusOutline: undefined,
  listInactiveSelectionBackground: "#3F3F46",
  listInactiveSelectionForeground: undefined,
  listInactiveSelectionIconForeground: "#FFFFFF",
  listSelectionOutline: undefined,
  tableColumnsBorder: "rgba(204, 204, 204, 0.2)",
  tableOddRowsBackgroundColor: "rgba(204, 204, 204, 0.04)",
  treeInactiveIndentGuidesStroke: "rgba(169, 169, 169, 0.4)",
  treeIndentGuidesStroke: "#a9a9a9",
  treeStickyScrollBackground: undefined,
  treeStickyScrollBorder: undefined,
  treeStickyScrollShadow: undefined,
};

export interface IListAccessibilityProvider<T> extends IListViewAccessibilityProvider<T> {
  getActiveDescendantId?(element: T): string | undefined;
  getAriaLabel?(element: T): string | null | undefined;
  getWidgetAriaLabel?(): string | undefined;
  getWidgetRole?(): AriaRole;
  readonly onDidChangeActiveDescendant?: BaseEvent<void>;
}

export interface IListOptions<T> extends Omit<
  IListViewOptions<T>,
  "accessibilityProvider" | "dnd" | "focusedKey" | "items" | "onDidFocus" | "onKeyDown" | "onSelect" | "selectedKey" | "selectedKeys"
> {
  readonly accessibilityProvider?: IListAccessibilityProvider<T>;
  readonly dnd?: IListDragAndDrop<T>;
  readonly identityProvider?: IIdentityProvider<T>;
  readonly items?: readonly T[];
  readonly keyboardNavigationDelegate?: IKeyboardNavigationDelegate;
  readonly keyboardNavigationEventFilter?: IKeyboardNavigationEventFilter;
  readonly keyboardNavigationLabelProvider?: IKeyboardNavigationLabelProvider<T>;
  readonly keyboardSupport?: boolean;
  readonly mouseSupport?: boolean;
  readonly multipleSelectionController?: IMultipleSelectionController<T>;
  readonly multipleSelectionSupport?: boolean;
  readonly typeNavigationEnabled?: boolean;
  readonly typeNavigationMode?: TypeNavigationMode;
}

export type IListOptionsUpdate<T> = Partial<Omit<IListOptions<T>, "items">>;

// Conductor tree/file views keep only this imperative list surface for layout and reveal.
export type ListHandle = {
  focus: () => void;
  getViewport: () => HTMLDivElement | null;
  layout: (height?: number, width?: number) => void;
  scrollToEnd: (behavior?: ScrollBehavior) => void;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  scrollToStart: (behavior?: ScrollBehavior) => void;
};

interface ITraitChangeEvent {
  readonly browserEvent?: UIEvent;
  readonly indexes: readonly number[];
}

const numericSort = (first: number, second: number): number => first - second;

const sanitizeIndexes = (indexes: readonly number[]): number[] =>
  distinct(indexes.filter(index => Number.isInteger(index) && index >= 0));

const classNames = (...classes: Array<string | undefined>): string | undefined => {
  const result = classes.filter((className): className is string => !!className).join(" ");
  return result || undefined;
};

let listStyleControllerId = 0;

function getContiguousRangeContaining(sortedRange: readonly number[], value: number): number[] {
  const index = sortedRange.indexOf(value);
  if (index === -1) {
    return [];
  }

  const result: number[] = [];
  let cursor = index - 1;
  while (cursor >= 0 && sortedRange[cursor] === value - (index - cursor)) {
    result.push(sortedRange[cursor]);
    cursor -= 1;
  }

  result.reverse();
  cursor = index;
  while (cursor < sortedRange.length && sortedRange[cursor] === value + (cursor - index)) {
    result.push(sortedRange[cursor]);
    cursor += 1;
  }

  return result;
}

function disjunction(first: readonly number[], second: readonly number[]): number[] {
  return sanitizeIndexes([...first, ...second]).sort(numericSort);
}

function relativeComplement(first: readonly number[], second: readonly number[]): number[] {
  const secondSet = new Set(second);
  return first.filter(value => !secondSet.has(value));
}

function isListElementDescendantOfClass(element: HTMLElement, className: string): boolean {
  if (element.classList.contains(className)) {
    return true;
  }

  if (element.classList.contains("ui-list")) {
    return false;
  }

  if (!element.parentElement) {
    return false;
  }

  return isListElementDescendantOfClass(element.parentElement, className);
}

export function isMonacoEditor(element: HTMLElement): boolean {
  return isListElementDescendantOfClass(element, "monaco-editor");
}

export function isSelectionSingleChangeEvent(event: IListMouseEvent<unknown> | IListTouchEvent<unknown>): boolean {
  return isMacintosh ? event.browserEvent.metaKey : event.browserEvent.ctrlKey;
}

export function isSelectionRangeChangeEvent(event: IListMouseEvent<unknown> | IListTouchEvent<unknown>): boolean {
  return event.browserEvent.shiftKey;
}

function isMouseRightClick(event: UIEvent): boolean {
  return event instanceof MouseEvent && event.button === 2;
}

const DefaultMultipleSelectionController: IMultipleSelectionController<unknown> = {
  isSelectionRangeChangeEvent,
  isSelectionSingleChangeEvent,
};

export const DefaultKeyboardNavigationDelegate = new class implements IKeyboardNavigationDelegate {
  public mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    return (event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ)
      || (event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9)
      || (event.keyCode >= KeyCode.Numpad0 && event.keyCode <= KeyCode.Numpad9)
      || (event.keyCode >= KeyCode.Semicolon && event.keyCode <= KeyCode.Quote);
  }
}();

class Trait<T> implements ISpliceable<boolean>, IDisposable {
  private indexes: number[];
  private sortedIndexes: number[];
  private readonly onChangeEmitter = new Emitter<ITraitChangeEvent>();

  public readonly onChange: BaseEvent<ITraitChangeEvent> = this.onChangeEmitter.event;

  public constructor(private readonly trait: string, indexes: readonly number[] = []) {
    this.indexes = sanitizeIndexes(indexes);
    this.sortedIndexes = [...this.indexes].sort(numericSort);
  }

  public get name(): string {
    return this.trait;
  }

  public set(indexes: readonly number[], browserEvent?: UIEvent): number[] {
    const next = sanitizeIndexes(indexes);
    const sortedNext = [...next].sort(numericSort);
    const previous = this.indexes;

    if (equals(this.indexes, next)) {
      return previous;
    }

    this.indexes = next;
    this.sortedIndexes = sortedNext;
    this.onChangeEmitter.fire({
      browserEvent,
      indexes: this.indexes,
    });

    return previous;
  }

  public reset(indexes: readonly number[]): void {
    const next = sanitizeIndexes(indexes);
    this.indexes = next;
    this.sortedIndexes = [...next].sort(numericSort);
  }

  public splice(start: number, deleteCount: number, elements: readonly boolean[]): void {
    const end = start + deleteCount;
    const diff = elements.length - deleteCount;
    const nextIndexes: number[] = [];

    for (const index of this.sortedIndexes) {
      if (index < start) {
        nextIndexes.push(index);
      }
    }

    elements.forEach((selected, index) => {
      if (selected) {
        nextIndexes.push(start + index);
      }
    });

    for (const index of this.sortedIndexes) {
      if (index >= end) {
        nextIndexes.push(index + diff);
      }
    }

    this.set(nextIndexes);
  }

  public get(): number[] {
    return [...this.indexes];
  }

  public contains(index: number): boolean {
    return this.sortedIndexes.includes(index);
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }
}

class SelectionTrait<T> extends Trait<T> {
  public constructor(indexes: readonly number[] = []) {
    super("selected", indexes);
  }
}

class ListItemsSpliceable<T> implements ISpliceable<T> {
  public constructor(
    private readonly getItems: () => T[],
    private readonly setItems: (items: T[]) => void,
  ) {}

  public splice(start: number, deleteCount: number, elements: readonly T[]): void {
    const items = this.getItems().slice();
    items.splice(start, deleteCount, ...elements);
    this.setItems(items);
  }
}

class ListViewSpliceable<T> implements ISpliceable<T> {
  public constructor(private readonly view: ListView<T>) {}

  public splice(start: number, deleteCount: number, elements: readonly T[]): void {
    this.view.splice(start, deleteCount, elements);
  }
}

class TraitSpliceable<T> implements ISpliceable<T> {
  public constructor(
    private readonly trait: Trait<T>,
    private readonly getPreviousItems: () => readonly T[],
    private readonly getKey: (item: T, index: number) => string,
  ) {}

  public splice(start: number, deleteCount: number, elements: readonly T[]): void {
    const previousItems = this.getPreviousItems();
    const traitKeys = new Set(
      this.trait.get()
        .map(index => {
          const item = previousItems[index];
          return typeof item === "undefined" ? undefined : this.getKey(item, index);
        })
        .filter((key): key is string => typeof key === "string"),
    );
    const insertedElementsWithTrait = elements.map(
      (element, index) => traitKeys.has(this.getKey(element, start + index)),
    );

    this.trait.splice(start, deleteCount, insertedElementsWithTrait);
  }
}

class KeyboardController<T> implements IDisposable {
  private readonly disposables = new DisposableStore();
  private multipleSelectionSupport: boolean | undefined;

  public constructor(
    private readonly list: List<T>,
    private readonly view: ListView<T>,
    options: IListOptions<T>,
  ) {
    this.multipleSelectionSupport = options.multipleSelectionSupport;
    this.list.onKeyDown(this.onKeyDown, this, this.disposables);
  }

  public updateOptions(options: IListOptionsUpdate<T>): void {
    if (typeof options.multipleSelectionSupport !== "undefined") {
      this.multipleSelectionSupport = options.multipleSelectionSupport;
    }
  }

  public dispose(): void {
    this.disposables.dispose();
  }

  private onKeyDown(browserEvent: KeyboardEvent): void {
    if (browserEvent.target instanceof Element && isEditableElement(browserEvent.target)) {
      return;
    }

    const event = new StandardKeyboardEvent(browserEvent);
    switch (event.keyCode) {
      case KeyCode.Enter:
      case KeyCode.Space:
        this.onEnter(event);
        return;
      case KeyCode.UpArrow:
        this.onUpArrow(event);
        return;
      case KeyCode.DownArrow:
        this.onDownArrow(event);
        return;
      case KeyCode.PageUp:
        this.onPageUp(event);
        return;
      case KeyCode.PageDown:
        this.onPageDown(event);
        return;
      case KeyCode.Home:
        this.onHome(event);
        return;
      case KeyCode.End:
        this.onEnd(event);
        return;
      case KeyCode.Escape:
        this.onEscape(event);
        return;
      case KeyCode.KeyA:
        if (this.multipleSelectionSupport && (isMacintosh ? event.metaKey : event.ctrlKey)) {
          this.onCtrlA(event);
        }
        return;
    }
  }

  private onEnter(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.setSelection(this.list.getFocus(), event.browserEvent);
  }

  private onUpArrow(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.focusPrevious(1, false, event.browserEvent);
    const index = this.list.getFocus()[0];
    this.list.setAnchor(index);
    if (typeof index === "number") {
      this.list.reveal(index);
    }
    this.view.domNode.focus();
  }

  private onDownArrow(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.focusNext(1, false, event.browserEvent);
    const index = this.list.getFocus()[0];
    this.list.setAnchor(index);
    if (typeof index === "number") {
      this.list.reveal(index);
    }
    this.view.domNode.focus();
  }

  private onPageUp(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.focusPreviousPage(event.browserEvent);
    const index = this.list.getFocus()[0];
    this.list.setAnchor(index);
    if (typeof index === "number") {
      this.list.reveal(index);
    }
    this.view.domNode.focus();
  }

  private onPageDown(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.focusNextPage(event.browserEvent);
    const index = this.list.getFocus()[0];
    this.list.setAnchor(index);
    if (typeof index === "number") {
      this.list.reveal(index);
    }
    this.view.domNode.focus();
  }

  private onHome(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.focusFirst(event.browserEvent);
    const index = this.list.getFocus()[0];
    this.list.setAnchor(index);
    if (typeof index === "number") {
      this.list.reveal(index);
    }
  }

  private onEnd(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.list.focusLast(event.browserEvent);
    const index = this.list.getFocus()[0];
    this.list.setAnchor(index);
    if (typeof index === "number") {
      this.list.reveal(index);
    }
  }

  private onCtrlA(event: StandardKeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();

    let selection = range(this.list.length);
    const focusedIndex = this.list.getFocus()[0];
    const referenceGroupId = typeof focusedIndex === "number"
      ? this.list.getElementGroupId(focusedIndex)
      : undefined;
    if (typeof referenceGroupId !== "undefined") {
      selection = this.list.filterIndicesByGroup(selection, referenceGroupId);
    }

    this.list.setSelection(selection, event.browserEvent);
    this.list.setAnchor(undefined);
    this.view.domNode.focus();
  }

  private onEscape(event: StandardKeyboardEvent): void {
    if (!this.list.getSelection().length) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.list.setSelection([], event.browserEvent);
    this.list.setAnchor(undefined);
    this.view.domNode.focus();
  }
}

class TypeNavigationController<T> implements IDisposable {
  private readonly disposables = new DisposableStore();
  private enabled = false;
  private input = "";
  private mode = TypeNavigationMode.Automatic;
  private clearHandle: ReturnType<typeof setTimeout> | undefined;
  private previouslyFocused = -1;
  private state = TypeNavigationControllerState.Idle;
  private triggered = false;

  public constructor(
    private readonly list: List<T>,
    private readonly keyboardNavigationLabelProvider: IKeyboardNavigationLabelProvider<T>,
    private readonly keyboardNavigationEventFilter: IKeyboardNavigationEventFilter,
    private readonly delegate: IKeyboardNavigationDelegate,
  ) {
    this.list.onKeyDown(this.onKeyDown, this, this.disposables);
    this.updateOptions(list.options);
  }

  public updateOptions(options: IListOptions<T>): void {
    if (options.typeNavigationEnabled ?? true) {
      this.enabled = true;
    } else {
      this.clear();
      this.enabled = false;
    }

    this.mode = options.typeNavigationMode ?? TypeNavigationMode.Automatic;
  }

  public trigger(): void {
    this.triggered = !this.triggered;
  }

  public dispose(): void {
    this.clear();
    this.disposables.dispose();
  }

  private onKeyDown(browserEvent: KeyboardEvent): void {
    if (!this.enabled) {
      return;
    }

    if (browserEvent.target instanceof Element && isEditableElement(browserEvent.target)) {
      return;
    }

    if (this.mode === TypeNavigationMode.Trigger && !this.triggered) {
      return;
    }

    const event = new StandardKeyboardEvent(browserEvent);
    if (this.state === TypeNavigationControllerState.Idle && !this.keyboardNavigationEventFilter(event)) {
      return;
    }

    if (!this.delegate.mightProducePrintableCharacter(event)) {
      return;
    }

    const key = event.browserEvent.key;
    if (!key || key.length !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.input += key;
    this.state = TypeNavigationControllerState.Typing;
    this.focusMatchingElement(this.input);
    this.scheduleClear();
  }

  private focusMatchingElement(word: string): void {
    const focus = this.list.getFocus();
    const start = focus.length > 0 ? focus[0] : 0;
    const delta = this.input.length === 1 ? 1 : 0;

    for (let offset = 0; offset < this.list.length; offset += 1) {
      const index = (start + offset + delta) % this.list.length;
      const labels = this.getKeyboardNavigationLabels(this.list.element(index));
      if (labels.some(label => this.matches(word, label))) {
        this.previouslyFocused = start;
        this.list.setFocus([index]);
        this.list.reveal(index);
        return;
      }
    }
  }

  private getKeyboardNavigationLabels(element: T): string[] {
    const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element);
    const labels = Array.isArray(label) ? label : [label];
    return labels
      .map(value => value?.toString())
      .filter((value): value is string => typeof value === "string");
  }

  private matches(word: string, label: string): boolean {
    if (matchesPrefix(word, label)) {
      return true;
    }

    const fuzzy = matchesFuzzy2(word, label);
    return !!fuzzy && fuzzy.length === 1 && fuzzy[0].end - fuzzy[0].start > 1;
  }

  private scheduleClear(): void {
    if (this.clearHandle) {
      clearTimeout(this.clearHandle);
    }

    this.clearHandle = setTimeout(() => this.clear(), 800);
  }

  private clear(): void {
    if (this.clearHandle) {
      clearTimeout(this.clearHandle);
      this.clearHandle = undefined;
    }

    this.input = "";
    this.state = TypeNavigationControllerState.Idle;
    this.triggered = false;

    const focus = this.list.getFocus();
    if (focus.length > 0 && focus[0] === this.previouslyFocused) {
      const ariaLabel = this.list.options.accessibilityProvider?.getAriaLabel?.(
        this.list.element(focus[0]),
      );
      if (ariaLabel) {
        ariaAlert(ariaLabel);
      }
    }
    this.previouslyFocused = -1;
  }
}

class DOMFocusController<T> implements IDisposable {
  private readonly disposables = new DisposableStore();

  public constructor(
    private readonly list: List<T>,
    private readonly view: ListView<T>,
  ) {
    this.list.onKeyDown(this.onKeyDown, this, this.disposables);
  }

  public dispose(): void {
    this.disposables.dispose();
  }

  private onKeyDown(browserEvent: KeyboardEvent): void {
    const event = new StandardKeyboardEvent(browserEvent);
    if (
      event.keyCode !== KeyCode.Tab ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.target !== this.view.getViewport()
    ) {
      return;
    }

    const focus = this.list.getFocus();
    if (!focus.length) {
      return;
    }

    const focusedDomElement = this.view.domElement(focus[0]);
    const tabIndexElement = focusedDomElement?.querySelector("[tabIndex]");
    if (!tabIndexElement || !isHTMLElement(tabIndexElement) || tabIndexElement.tabIndex === -1) {
      return;
    }

    const style = getWindow(tabIndexElement).getComputedStyle(tabIndexElement);
    if (style.visibility === "hidden" || style.display === "none") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    tabIndexElement.focus();
  }
}

export class MouseController<T> implements IDisposable {
  private multipleSelectionController: IMultipleSelectionController<T> | undefined;
  private readonly mouseSupport: boolean;
  private readonly disposables = new DisposableStore();
  private readonly onPointerEmitter = this.disposables.add(new Emitter<IListMouseEvent<T>>());

  public readonly onPointer = this.onPointerEmitter.event;

  public constructor(protected readonly list: List<T>) {
    if (list.options.multipleSelectionSupport !== false) {
      this.multipleSelectionController = (
        list.options.multipleSelectionController ??
        DefaultMultipleSelectionController
      ) as IMultipleSelectionController<T>;
    }

    this.mouseSupport = list.options.mouseSupport !== false;
    if (this.mouseSupport) {
      list.onMouseDown(this.onMouseDown, this, this.disposables);
      list.onContextMenu(this.onContextMenu, this, this.disposables);
      list.onMouseDblClick(this.onDoubleClick, this, this.disposables);
    }

    Event.any<IListMouseEvent<T> | IListGestureEvent<T>>(
      list.onMouseClick,
      list.onMouseMiddleClick,
    )(
      event => this.onViewPointer(event as IListMouseEvent<T>),
      undefined,
      this.disposables,
    );
  }

  public updateOptions(options: IListOptionsUpdate<T>): void {
    if (typeof options.multipleSelectionSupport === "undefined") {
      return;
    }

    this.multipleSelectionController = undefined;
    if (options.multipleSelectionSupport) {
      this.multipleSelectionController = (
        this.list.options.multipleSelectionController ??
        DefaultMultipleSelectionController
      ) as IMultipleSelectionController<T>;
    }
  }

  public dispose(): void {
    this.disposables.dispose();
  }

  protected isSelectionSingleChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
    return this.multipleSelectionController?.isSelectionSingleChangeEvent(event) ?? false;
  }

  protected isSelectionRangeChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
    return this.multipleSelectionController?.isSelectionRangeChangeEvent(event) ?? false;
  }

  private isSelectionChangeEvent(event: IListMouseEvent<T> | IListTouchEvent<T>): boolean {
    return this.isSelectionSingleChangeEvent(event) || this.isSelectionRangeChangeEvent(event);
  }

  protected onMouseDown(event: IListMouseEvent<T>): void {
    const target = event.browserEvent.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (isMonacoEditor(target)) {
      return;
    }

    if (target !== target.ownerDocument.activeElement) {
      this.list.domFocus();
    }
  }

  protected onContextMenu(event: IListContextMenuEvent<T>): void {
    if (
      event.browserEvent.target instanceof Element &&
      (isEditableElement(event.browserEvent.target) ||
        event.browserEvent.target instanceof HTMLElement && isMonacoEditor(event.browserEvent.target))
    ) {
      return;
    }

    this.list.setFocus(typeof event.index === "undefined" ? [] : [event.index], event.browserEvent);
  }

  protected onViewPointer(event: IListMouseEvent<T>): void {
    if (!this.mouseSupport) {
      return;
    }

    if (
      event.browserEvent.target instanceof Element &&
      (isEditableElement(event.browserEvent.target) ||
        event.browserEvent.target instanceof HTMLElement && isMonacoEditor(event.browserEvent.target))
    ) {
      return;
    }

    if (event.browserEvent.isHandledByList) {
      return;
    }

    event.browserEvent.isHandledByList = true;
    const focus = event.index;
    if (typeof focus === "undefined") {
      this.list.setFocus([], event.browserEvent);
      this.list.setSelection([], event.browserEvent);
      this.list.setAnchor(undefined);
      return;
    }

    if (this.isSelectionChangeEvent(event)) {
      this.changeSelection(event);
      return;
    }

    this.list.setFocus([focus], event.browserEvent);
    this.list.setAnchor(focus);

    if (!isMouseRightClick(event.browserEvent) && this.list.getElementGroupId(focus) !== NotSelectableGroupId) {
      this.list.setSelection([focus], event.browserEvent);
    }

    this.onPointerEmitter.fire(event);
  }

  protected onDoubleClick(event: IListMouseEvent<T>): void {
    if (
      event.browserEvent.target instanceof Element &&
      (isEditableElement(event.browserEvent.target) ||
        event.browserEvent.target instanceof HTMLElement && isMonacoEditor(event.browserEvent.target))
    ) {
      return;
    }

    if (this.isSelectionChangeEvent(event) || event.browserEvent.isHandledByList) {
      return;
    }

    event.browserEvent.isHandledByList = true;
    this.list.setSelection(this.list.getFocus(), event.browserEvent);
  }

  private changeSelection(event: IListMouseEvent<T> | IListTouchEvent<T>): void {
    const focus = event.index;
    if (typeof focus === "undefined") {
      return;
    }

    if (this.isSelectionRangeChangeEvent(event)) {
      let anchor = this.list.getAnchor();
      if (typeof anchor === "undefined") {
        anchor = this.list.getFocus()[0] ?? focus;
        this.list.setAnchor(anchor);
      }

      const min = Math.min(anchor, focus);
      const max = Math.max(anchor, focus);
      let rangeSelection = range(min, max + 1);
      const selectedIndex = this.list.getSelection()[0];
      if (typeof selectedIndex !== "undefined") {
        const referenceGroupId = this.list.getElementGroupId(selectedIndex);
        if (typeof referenceGroupId !== "undefined") {
          rangeSelection = this.list.filterIndicesByGroup(rangeSelection, referenceGroupId);
        }
      }

      const selection = this.list.getSelection();
      const contiguousRange = getContiguousRangeContaining(
        disjunction(selection, [anchor]),
        anchor,
      );
      if (!contiguousRange.length) {
        return;
      }

      const newSelection = disjunction(rangeSelection, relativeComplement(selection, contiguousRange));
      this.list.setSelection(newSelection, event.browserEvent);
      this.list.setFocus([focus], event.browserEvent);
      return;
    }

    if (this.isSelectionSingleChangeEvent(event)) {
      const selection = this.list.getSelection();
      const newSelection = selection.filter(index => index !== focus);

      this.list.setFocus([focus], event.browserEvent);
      this.list.setAnchor(focus);

      const focusGroupId = this.list.getElementGroupId(focus);
      if (focusGroupId === NotSelectableGroupId) {
        return;
      }

      if (selection.length === newSelection.length) {
        const itemsToBeSelected = typeof focusGroupId !== "undefined"
          ? this.list.filterIndicesByGroup([...newSelection, focus], focusGroupId)
          : [...newSelection, focus];
        this.list.setSelection(itemsToBeSelected, event.browserEvent);
      } else {
        this.list.setSelection(newSelection, event.browserEvent);
      }
    }
  }
}

class ListViewDragAndDrop<T> implements IListViewDragAndDrop<T> {
  public constructor(
    private readonly list: List<T>,
    private readonly dnd: IListDragAndDrop<T>,
  ) {}

  public getDragElements(element: T): T[] {
    const selection = this.list.getSelectedElements();
    return selection.includes(element) ? selection : [element];
  }

  public getDragURI(element: T): string | null {
    return this.dnd.getDragURI(element);
  }

  public getDragLabel(elements: T[], originalEvent: DragEvent): string | undefined {
    return this.dnd.getDragLabel?.(elements, originalEvent);
  }

  public onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
    this.dnd.onDragStart?.(data, originalEvent);
  }

  public onDragOver(
    data: IDragAndDropData,
    targetElement: T | undefined,
    targetIndex: number | undefined,
    targetSector: ListViewTargetSector | undefined,
    originalEvent: DragEvent,
  ): boolean | IListDragOverReaction {
    return this.dnd.onDragOver(data, targetElement, targetIndex, targetSector, originalEvent);
  }

  public onDragLeave(
    data: IDragAndDropData,
    targetElement: T | undefined,
    targetIndex: number | undefined,
    originalEvent: DragEvent,
  ): void {
    this.dnd.onDragLeave?.(data, targetElement, targetIndex, originalEvent);
  }

  public drop(
    data: IDragAndDropData,
    targetElement: T | undefined,
    targetIndex: number | undefined,
    targetSector: ListViewTargetSector | undefined,
    originalEvent: DragEvent,
  ): void {
    this.dnd.drop(data, targetElement, targetIndex, targetSector, originalEvent);
  }

  public onDragEnd(originalEvent: DragEvent): void {
    this.dnd.onDragEnd?.(originalEvent);
  }

  public dispose(): void {
    this.dnd.dispose();
  }
}

export class List<T> extends Disposable implements ListHandle {
  private readonly focusTrait: Trait<T>;
  private readonly selectionTrait: SelectionTrait<T>;
  private readonly anchorTrait: Trait<T>;
  private readonly eventBufferer = new EventBufferer();
  private readonly onDidFocusEmitter = this._register(new Emitter<void>());
  private readonly onDidBlurEmitter = this._register(new Emitter<void>());
  private readonly onDidDisposeEmitter = this._register(new Emitter<void>());
  private readonly onKeyDownEmitter = this._register(new Emitter<KeyboardEvent>());
  private readonly onKeyUpEmitter = this._register(new Emitter<KeyboardEvent>());
  private readonly onKeyPressEmitter = this._register(new Emitter<KeyboardEvent>());
  private readonly onMouseClickEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseDblClickEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseMiddleClickEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseDownEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseUpEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseOverEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseMoveEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onMouseOutEmitter = this._register(new Emitter<IListMouseEvent<T>>());
  private readonly onContextMenuEmitter = this._register(new Emitter<IListContextMenuEvent<T>>());

  private readonly view: ListView<T>;
  private readonly spliceable: ISpliceable<T>;
  private readonly mouseController: MouseController<T>;
  private readonly styleClassName = `ui-list-style-${++listStyleControllerId}`;
  private readonly styleController: DefaultStyleController;
  private keyboardController: KeyboardController<T> | undefined;
  private typeNavigationController: TypeNavigationController<T> | undefined;
  private viewDragAndDrop: ListViewDragAndDrop<T> | undefined;
  private viewDragAndDropSource: IListDragAndDrop<T> | undefined;
  private items: T[];
  private previousSpliceItems: readonly T[] | undefined;
  private disposed = false;

  public constructor(
    container: HTMLElement,
    private _options: IListOptions<T>,
  ) {
    super();

    this.items = _options.items?.slice() ?? [];
    this.focusTrait = this._register(new Trait<T>("focused"));
    this.selectionTrait = this._register(new SelectionTrait<T>());
    this.anchorTrait = this._register(new Trait<T>("anchor"));
    this.view = this._register(new ListView(container, this.createViewOptions()));
    this.styleController = new DefaultStyleController(createStyleSheet(this.view.domNode), this.styleClassName);
    this.spliceable = new CombinedSpliceable([
      new ListItemsSpliceable(
        () => this.items,
        items => { this.items = items; },
      ),
      new ListViewSpliceable(this.view),
      new TraitSpliceable(
        this.focusTrait,
        () => this.previousSpliceItems ?? this.items,
        (item, index) => this.options.getKey(item, index),
      ),
      new TraitSpliceable(
        this.selectionTrait,
        () => this.previousSpliceItems ?? this.items,
        (item, index) => this.options.getKey(item, index),
      ),
      new TraitSpliceable(
        this.anchorTrait,
        () => this.previousSpliceItems ?? this.items,
        (item, index) => this.options.getKey(item, index),
      ),
    ]);

    this.registerDomListeners();
    this._register(new DOMFocusController(this, this.view));

    if (_options.keyboardSupport !== false) {
      this.keyboardController = this._register(new KeyboardController(this, this.view, _options));
    }

    if (_options.keyboardNavigationLabelProvider) {
      this.typeNavigationController = this._register(new TypeNavigationController(
        this,
        _options.keyboardNavigationLabelProvider,
        _options.keyboardNavigationEventFilter ?? (() => true),
        _options.keyboardNavigationDelegate ?? DefaultKeyboardNavigationDelegate,
      ));
    }

    this.mouseController = this._register(new MouseController(this));
  }

  public get options(): IListOptions<T> {
    return this._options;
  }

  public get length(): number {
    return this.items.length;
  }

  @memoize
  public get onDidChangeFocus(): BaseEvent<IListEvent<T>> {
    return Event.map<ITraitChangeEvent, IListEvent<T>>(
      this.eventBufferer.wrapEvent<ITraitChangeEvent>(this.focusTrait.onChange),
      event => this.toListEvent(event),
    );
  }

  @memoize
  public get onDidChangeSelection(): BaseEvent<IListEvent<T>> {
    return Event.map<ITraitChangeEvent, IListEvent<T>>(
      this.eventBufferer.wrapEvent<ITraitChangeEvent>(this.selectionTrait.onChange),
      event => this.toListEvent(event),
    );
  }

  public readonly onDidFocus: BaseEvent<void> = this.onDidFocusEmitter.event;
  public readonly onDidBlur: BaseEvent<void> = this.onDidBlurEmitter.event;
  public readonly onDidDispose: BaseEvent<void> = this.onDidDisposeEmitter.event;
  public readonly onKeyDown: BaseEvent<KeyboardEvent> = this.onKeyDownEmitter.event;
  public readonly onKeyUp: BaseEvent<KeyboardEvent> = this.onKeyUpEmitter.event;
  public readonly onKeyPress: BaseEvent<KeyboardEvent> = this.onKeyPressEmitter.event;
  public readonly onMouseClick: BaseEvent<IListMouseEvent<T>> = this.onMouseClickEmitter.event;
  public readonly onMouseDblClick: BaseEvent<IListMouseEvent<T>> = this.onMouseDblClickEmitter.event;
  public readonly onMouseMiddleClick: BaseEvent<IListMouseEvent<T>> = this.onMouseMiddleClickEmitter.event;
  public readonly onMouseDown: BaseEvent<IListMouseEvent<T>> = this.onMouseDownEmitter.event;
  public readonly onMouseUp: BaseEvent<IListMouseEvent<T>> = this.onMouseUpEmitter.event;
  public readonly onMouseOver: BaseEvent<IListMouseEvent<T>> = this.onMouseOverEmitter.event;
  public readonly onMouseMove: BaseEvent<IListMouseEvent<T>> = this.onMouseMoveEmitter.event;
  public readonly onMouseOut: BaseEvent<IListMouseEvent<T>> = this.onMouseOutEmitter.event;
  public readonly onContextMenu: BaseEvent<IListContextMenuEvent<T>> = this.onContextMenuEmitter.event;

  public get onPointer(): BaseEvent<IListMouseEvent<T>> {
    return this.mouseController.onPointer;
  }

  public element(index: number): T {
    const item = this.items[index];
    if (typeof item === "undefined") {
      throw new ListError("List", `Invalid index ${index}`);
    }

    return item;
  }

  public indexOf(element: T): number {
    return this.items.indexOf(element);
  }

  public setItems(items: readonly T[]): void {
    const selectedKeys = this.getKeysForIndexes(this.selectionTrait.get());
    const focusedKeys = this.getKeysForIndexes(this.focusTrait.get());
    const anchorKeys = this.getKeysForIndexes(this.anchorTrait.get());

    this.items = items.slice();
    this.selectionTrait.set(this.getIndexesForKeys(selectedKeys));
    this.focusTrait.set(this.getIndexesForKeys(focusedKeys));
    this.anchorTrait.set(this.getIndexesForKeys(anchorKeys));
    this.view.setProps(this.createViewOptions());
  }

  public updateOptions(options: IListOptionsUpdate<T> & IListViewOptionsUpdate): void {
    const selectedKeys = this.getKeysForIndexes(this.selectionTrait.get());
    const focusedKeys = this.getKeysForIndexes(this.focusTrait.get());
    const anchorKeys = this.getKeysForIndexes(this.anchorTrait.get());

    this._options = { ...this._options, ...options };
    this.selectionTrait.set(this.getIndexesForKeys(selectedKeys));
    this.focusTrait.set(this.getIndexesForKeys(focusedKeys));
    this.anchorTrait.set(this.getIndexesForKeys(anchorKeys));
    this.typeNavigationController?.updateOptions(this._options);
    this.mouseController.updateOptions(options);
    this.keyboardController?.updateOptions(options);
    this.view.setProps(this.createViewOptions());
  }

  public splice(start: number, deleteCount: number, elements: readonly T[] = []): void {
    if (start < 0 || start > this.items.length) {
      throw new ListError("List", `Invalid start index: ${start}`);
    }
    if (deleteCount < 0) {
      throw new ListError("List", `Invalid delete count: ${deleteCount}`);
    }
    if (deleteCount === 0 && elements.length === 0) {
      return;
    }

    this.previousSpliceItems = this.items.slice();
    try {
      this.eventBufferer.bufferEvents(() => {
        this.spliceable.splice(start, deleteCount, [...elements]);
      });
      this.view.setProps(this.createViewOptions());
    } finally {
      this.previousSpliceItems = undefined;
    }
  }

  public setSelection(indexes: readonly number[], browserEvent?: UIEvent): void {
    for (const index of indexes) {
      this.validateIndex(index);
    }

    const selectableIndexes = indexes.filter(index => this.getElementGroupId(index) !== NotSelectableGroupId);
    this.selectionTrait.set(selectableIndexes, browserEvent);
    this.view.setProps(this.createViewOptions());
  }

  public getSelection(): number[] {
    return this.selectionTrait.get();
  }

  public getSelectedElements(): T[] {
    return this.getSelection().map(index => this.element(index));
  }

  public setFocus(indexes: readonly number[], browserEvent?: UIEvent): void {
    for (const index of indexes) {
      this.validateIndex(index);
    }

    this.focusTrait.set(indexes, browserEvent);
    this.view.setProps(this.createViewOptions());
  }

  public getFocus(): number[] {
    return this.focusTrait.get();
  }

  public getFocusedElements(): T[] {
    return this.getFocus().map(index => this.element(index));
  }

  public setAnchor(index: number | undefined): void {
    if (typeof index === "undefined") {
      this.anchorTrait.set([]);
      return;
    }

    this.validateIndex(index);
    this.anchorTrait.set([index]);
  }

  public getAnchor(): number | undefined {
    return this.anchorTrait.get()[0];
  }

  public getAnchorElement(): T | undefined {
    const anchor = this.getAnchor();
    return typeof anchor === "undefined" ? undefined : this.element(anchor);
  }

  public getElementGroupId(index: number): number | NotSelectableGroupIdType | undefined {
    const identityProvider = this.options.identityProvider;
    if (!identityProvider?.getGroupId) {
      return undefined;
    }

    return identityProvider.getGroupId(this.element(index));
  }

  public filterIndicesByGroup(
    indexes: readonly number[],
    referenceGroupId: number | NotSelectableGroupIdType,
  ): number[] {
    const identityProvider = this.options.identityProvider;
    if (!identityProvider?.getGroupId) {
      return [...indexes];
    }

    if (referenceGroupId === NotSelectableGroupId) {
      return [];
    }

    return indexes.filter(index => identityProvider.getGroupId!(this.element(index)) === referenceGroupId);
  }

  public focusNext(
    count = 1,
    loop = false,
    browserEvent?: UIEvent,
    filter?: (element: T) => boolean,
  ): void {
    if (!this.length) {
      return;
    }

    const focus = this.focusTrait.get();
    const index = this.findNextIndex(focus.length ? focus[0] + count : 0, loop, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }

  public focusPrevious(
    count = 1,
    loop = false,
    browserEvent?: UIEvent,
    filter?: (element: T) => boolean,
  ): void {
    if (!this.length) {
      return;
    }

    const focus = this.focusTrait.get();
    const index = this.findPreviousIndex(focus.length ? focus[0] - count : 0, loop, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }

  public focusNextPage(browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
    this.focusNext(Math.max(1, this.getPageSize()), false, browserEvent, filter);
  }

  public focusPreviousPage(browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
    this.focusPrevious(Math.max(1, this.getPageSize()), false, browserEvent, filter);
  }

  public focusFirst(browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
    this.focusNth(0, browserEvent, filter);
  }

  public focusLast(browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
    if (!this.length) {
      return;
    }

    const index = this.findPreviousIndex(this.length - 1, false, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }

  public focusNth(index: number, browserEvent?: UIEvent, filter?: (element: T) => boolean): void {
    if (!this.length) {
      return;
    }

    const nextIndex = this.findNextIndex(index, false, filter);
    if (nextIndex > -1) {
      this.setFocus([nextIndex], browserEvent);
    }
  }

  public rerender(index?: number): void {
    this.view.rerender(index);
  }

  public rerenderIndexes(indexes: readonly number[]): void {
    this.view.rerenderIndexes(indexes);
  }

  public focus(): void {
    this.domFocus();
  }

  public domFocus(): void {
    this.view.focus();
  }

  public isDOMFocused(): boolean {
    return this.getViewport().ownerDocument.activeElement === this.getViewport();
  }

  public getHTMLElement(): HTMLElement {
    return this.getViewport();
  }

  public getViewport(): HTMLDivElement {
    return this.view.getViewport();
  }

  public get scrollTop(): number {
    return this.view.scrollTop;
  }

  public set scrollTop(scrollTop: number) {
    this.view.scrollTop = scrollTop;
  }

  public layout(height?: number, width?: number): void {
    this.view.layout(height, width);
  }

  public scrollToEnd(behavior?: ScrollBehavior): void {
    this.view.scrollToEnd(behavior);
  }

  public scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    this.view.scrollToIndex(index, behavior);
  }

  public scrollToStart(behavior?: ScrollBehavior): void {
    this.view.scrollToStart(behavior);
  }

  public reveal(index: number, _relativeTop?: number): void {
    this.validateIndex(index);
    this.scrollToIndex(index);
  }

  public triggerTypeNavigation(): void {
    this.typeNavigationController?.trigger();
  }

  public style(styles: IListStyles): void {
    this.styleController.style(styles);
  }

  public override dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.onDidDisposeEmitter.fire();
    super.dispose();
  }

  private createViewOptions(): IListViewOptions<T> {
    return {
      ...this.options,
      className: classNames(this.options.className, this.styleClassName),
      dnd: this.getViewDragAndDrop(),
      focusedKey: this.getKeyForIndex(this.focusTrait.get()[0]),
      items: this.items,
      role: this.options.accessibilityProvider?.getWidgetRole?.() ?? this.options.role,
      selectedKeys: this.getKeysForIndexes(this.selectionTrait.get()),
    };
  }

  private getViewDragAndDrop(): IListViewDragAndDrop<T> | undefined {
    const dnd = this.options.dnd;
    if (!dnd) {
      this.viewDragAndDrop = undefined;
      this.viewDragAndDropSource = undefined;
      return undefined;
    }

    if (this.viewDragAndDropSource !== dnd) {
      this.viewDragAndDrop = new ListViewDragAndDrop(this, dnd);
      this.viewDragAndDropSource = dnd;
    }

    return this.viewDragAndDrop;
  }

  private registerDomListeners(): void {
    const viewport = this.getViewport();

    this._register(addDisposableListener(viewport, EventType.FOCUS, () => {
      this.onDidFocusEmitter.fire();
    }));
    this._register(addDisposableListener(viewport, EventType.BLUR, () => {
      this.onDidBlurEmitter.fire();
    }));
    this._register(addDisposableListener(viewport, EventType.KEY_DOWN, event => {
      this.onKeyDownEmitter.fire(event);
    }));
    this._register(addDisposableListener(viewport, EventType.KEY_UP, event => {
      this.onKeyUpEmitter.fire(event);
      this.handleContextMenuKeyUp(event);
    }));
    this._register(addDisposableListener(viewport, EventType.KEY_PRESS, event => {
      this.onKeyPressEmitter.fire(event);
    }));

    this._register(this.view.onMouseClick(event => this.onMouseClickEmitter.fire(event)));
    this._register(this.view.onMouseDblClick(event => this.onMouseDblClickEmitter.fire(event)));
    this._register(this.view.onMouseMiddleClick(event => this.onMouseMiddleClickEmitter.fire(event)));
    this._register(this.view.onMouseDown(event => this.onMouseDownEmitter.fire(event)));
    this._register(this.view.onMouseUp(event => this.onMouseUpEmitter.fire(event)));
    this._register(this.view.onMouseOver(event => this.onMouseOverEmitter.fire(event)));
    this._register(this.view.onMouseMove(event => this.onMouseMoveEmitter.fire(event)));
    this._register(this.view.onMouseOut(event => this.onMouseOutEmitter.fire(event)));
    this._register(this.view.onContextMenu(event => {
      this.onContextMenuEmitter.fire({
        anchor: new StandardMouseEvent(getWindow(viewport), event.browserEvent),
        browserEvent: event.browserEvent,
        element: event.element,
        index: event.index,
      });
    }));
  }

  private handleContextMenuKeyUp(browserEvent: KeyboardEvent): void {
    const event = new StandardKeyboardEvent(browserEvent);
    if (event.keyCode !== KeyCode.ContextMenu && !(event.shiftKey && event.keyCode === KeyCode.F10)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const index = this.getFocus()[0];
    const element = typeof index === "number" ? this.element(index) : undefined;
    const anchor = typeof index === "number"
      ? this.view.domElement(index) ?? this.getViewport()
      : this.getViewport();

    this.onContextMenuEmitter.fire({
      anchor,
      browserEvent,
      element,
      index,
    });
  }

  private getKeyForIndex(index: number | undefined): string | null {
    if (typeof index !== "number") {
      return null;
    }

    const item = this.items[index];
    return typeof item === "undefined" ? null : this.options.getKey(item, index);
  }

  private getKeysForIndexes(indexes: readonly number[]): string[] {
    return indexes
      .map(index => this.getKeyForIndex(index))
      .filter((key): key is string => typeof key === "string");
  }

  private getIndexesForKeys(keys: readonly string[]): number[] {
    if (!keys.length) {
      return [];
    }

    const remaining = new Set(keys);
    const indexes: number[] = [];
    for (let index = 0; index < this.items.length; index += 1) {
      const key = this.options.getKey(this.items[index], index);
      if (remaining.has(key)) {
        indexes.push(index);
        remaining.delete(key);
      }
    }

    return indexes;
  }

  private findNextIndex(index: number, loop = false, filter?: (element: T) => boolean): number {
    for (let count = 0; count < this.length; count += 1) {
      if (index >= this.length && !loop) {
        return -1;
      }

      index = index % this.length;
      if (!filter || filter(this.element(index))) {
        return index;
      }

      index += 1;
    }

    return -1;
  }

  private findPreviousIndex(index: number, loop = false, filter?: (element: T) => boolean): number {
    for (let count = 0; count < this.length; count += 1) {
      if (index < 0 && !loop) {
        return -1;
      }

      index = (this.length + (index % this.length)) % this.length;
      if (!filter || filter(this.element(index))) {
        return index;
      }

      index -= 1;
    }

    return -1;
  }

  private getPageSize(): number {
    const first = this.items[0];
    if (typeof first === "undefined") {
      return 1;
    }

    const rowHeight = Math.max(1, this.options.delegate.getHeight(first));
    return Math.max(1, Math.floor(this.getViewport().clientHeight / rowHeight));
  }

  private validateIndex(index: number): void {
    if (index < 0 || index >= this.length) {
      throw new ListError("List", `Invalid index ${index}`);
    }
  }

  private toListEvent(event: ITraitChangeEvent): IListEvent<T> {
    const indexes = event.indexes.filter(index => index < this.items.length);
    return {
      browserEvent: event.browserEvent,
      elements: indexes.map(index => this.items[index]),
      indexes,
    };
  }
}
