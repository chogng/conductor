import type { IQuickAccessController } from "src/cs/platform/quickinput/common/quickAccess";
import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IQuickInputService = createDecorator<IQuickInputService>("quickInputService");

export interface IQuickInputButton {
  readonly iconClass?: string;
  readonly tooltip?: string;
}

export interface IQuickItemHighlights {
  readonly label?: readonly [number, number][];
  readonly description?: readonly [number, number][];
  readonly detail?: readonly [number, number][];
}

export interface QuickPickItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly ariaLabel?: string;
  readonly buttons?: readonly IQuickInputButton[];
  readonly keybinding?: string;
  readonly tooltip?: string;
  highlights?: IQuickItemHighlights;
}

export interface IQuickPickItem extends QuickPickItem {
  readonly picked?: boolean;
}

export interface IQuickPickSeparator {
  readonly type: "separator";
  readonly label?: string;
  readonly buttons?: readonly IQuickInputButton[];
}

export type QuickPickInput<T extends IQuickPickItem = IQuickPickItem> = T | IQuickPickSeparator;

export interface IKeyMods {
  readonly ctrlCmd: boolean;
  readonly alt: boolean;
}

export const NO_KEY_MODS: IKeyMods = Object.freeze({
  alt: false,
  ctrlCmd: false,
});

export function isKeyModified(keyMods: IKeyMods): boolean {
  return keyMods.alt || keyMods.ctrlCmd;
}

export interface IQuickPickWillAcceptEvent {
  readonly keyMods: IKeyMods;
  veto(): void;
}

export interface IQuickPickDidAcceptEvent {
  readonly inBackground: boolean;
  readonly keyMods: IKeyMods;
}

export interface IQuickPickItemButtonEvent<T extends IQuickPickItem> {
  readonly item: T;
  readonly button: IQuickInputButton;
  readonly buttonIndex: number;
  readonly keyMods: IKeyMods;
}

export interface IQuickPickSeparatorButtonEvent {
  readonly separator: IQuickPickSeparator;
  readonly button: IQuickInputButton;
  readonly buttonIndex: number;
  readonly keyMods: IKeyMods;
}

export const enum ItemActivation {
  NONE = 0,
  FIRST = 1,
  SECOND = 2,
  LAST = 3,
}

export interface IQuickNavigateConfiguration {
  readonly keybindings?: readonly unknown[];
}

export interface IQuickPick<T extends IQuickPickItem, O extends { useSeparators: boolean } = { useSeparators: false }>
  extends IDisposable {
  readonly onDidChangeValue: Event<string>;
  readonly onWillAccept: Event<IQuickPickWillAcceptEvent>;
  readonly onDidAccept: Event<IQuickPickDidAcceptEvent>;
  readonly onDidHide: Event<void>;
  readonly onDidTriggerItemButton: Event<IQuickPickItemButtonEvent<T>>;
  readonly onDidTriggerSeparatorButton: Event<IQuickPickSeparatorButtonEvent>;

  value: string;
  valueSelection: [number, number] | undefined;
  placeholder: string | undefined;
  emptyText: string | undefined;
  ariaLabel: string | undefined;
  quickNavigate: IQuickNavigateConfiguration | undefined;
  hideInput: boolean;
  itemActivation: ItemActivation;
  contextKey: string | undefined;
  filterValue: ((value: string) => string) | undefined;

  items: O extends { useSeparators: true } ? ReadonlyArray<T | IQuickPickSeparator> : ReadonlyArray<T>;
  activeItems: readonly T[];
  selectedItems: readonly T[];

  busy: boolean;
  canAcceptInBackground: boolean;
  matchOnLabel: boolean;
  matchOnDescription: boolean;
  matchOnDetail: boolean;
  sortByLabel: boolean;

  show(): void;
  hide(): void;
}

export interface QuickPickOptions<T extends QuickPickItem> {
  readonly ariaLabel?: string;
  readonly emptyText?: string;
  readonly items: readonly T[];
  readonly placeholder?: string;
  readonly value?: string;
}

export interface IQuickInputService {
  readonly _serviceBrand: undefined;
  readonly quickAccess: IQuickAccessController;

  pick<T extends IQuickPickItem>(options: QuickPickOptions<T>): Promise<T | undefined>;
  createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
  createQuickPick<T extends IQuickPickItem>(options?: { useSeparators?: false }): IQuickPick<T, { useSeparators: false }>;
}
