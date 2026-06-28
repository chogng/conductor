import { isThenable } from "src/cs/base/common/async";
import { CancellationToken, CancellationTokenSource } from "src/cs/base/common/cancellation";
import { Disposable, DisposableStore, MutableDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type {
  IKeyMods,
  IQuickPick,
  IQuickPickDidAcceptEvent,
  IQuickPickItem,
  IQuickPickSeparator,
} from "src/cs/platform/quickinput/common/quickInput";
import { isKeyModified } from "src/cs/platform/quickinput/common/quickInput";
import type {
  QuickAccessProvider,
  QuickAccessProviderRunOptions,
} from "src/cs/platform/quickinput/common/quickAccess";

export const enum TriggerAction {
  NO_ACTION,
  CLOSE_PICKER,
  REFRESH_PICKER,
  REMOVE_ITEM,
}

export interface IPickerQuickAccessItem extends IQuickPickItem {
  accept?(keyMods: IKeyMods, event: IQuickPickDidAcceptEvent): void | Promise<void>;
  trigger?(buttonIndex: number, keyMods: IKeyMods): TriggerAction | Promise<TriggerAction>;
  attach?(keyMods: IKeyMods, event: IQuickPickDidAcceptEvent): void | Promise<void>;
}

export interface IPickerQuickAccessSeparator extends IQuickPickSeparator {
  trigger?(buttonIndex: number, keyMods: IKeyMods): TriggerAction | Promise<TriggerAction>;
}

export interface IPickerQuickAccessProviderOptions<T extends IPickerQuickAccessItem> {
  readonly canAcceptInBackground?: boolean;
  readonly noResultsPick?: T | ((filter: string) => T);
  readonly shouldSkipTrimPickFilter?: boolean;
}

export type Pick<T> = T | IQuickPickSeparator;
export type PicksWithActive<T> = { readonly items: readonly Pick<T>[]; readonly active?: T };
export type Picks<T> = readonly Pick<T>[] | PicksWithActive<T>;
export type FastAndSlowPicks<T> = {
  readonly picks: Picks<T>;
  readonly additionalPicks: Promise<Picks<T>>;
  readonly mergeDelay?: number;
};

export abstract class PickerQuickAccessProvider<T extends IPickerQuickAccessItem = IPickerQuickAccessItem>
  extends Disposable implements QuickAccessProvider {

  public constructor(
    private readonly prefix = "",
    protected readonly options?: IPickerQuickAccessProviderOptions<T>,
  ) {
    super();
  }

  public provide(filter: string): readonly T[] | Promise<readonly T[]>;
  public provide(
    picker: IQuickPick<IQuickPickItem, { useSeparators: true }>,
    token: CancellationToken,
    runOptions?: QuickAccessProviderRunOptions,
  ): IDisposable;
  public provide(
    pickerOrFilter: IQuickPick<IQuickPickItem, { useSeparators: true }> | string,
    token: CancellationToken = CancellationToken.None,
    runOptions?: QuickAccessProviderRunOptions,
  ): IDisposable | readonly T[] | Promise<readonly T[]> {
    if (typeof pickerOrFilter === "string") {
      return this.provideForFilter(pickerOrFilter, runOptions);
    }

    const picker = pickerOrFilter as IQuickPick<T, { useSeparators: true }>;
    const disposables = new DisposableStore();
    const picksDisposable = disposables.add(new MutableDisposable<DisposableStore>());
    let picksCts: CancellationTokenSource | undefined;

    picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;
    picker.matchOnLabel = false;
    picker.matchOnDescription = false;
    picker.matchOnDetail = false;
    picker.sortByLabel = false;

    const updatePickerItems = async (): Promise<void> => {
      picksCts?.cancel();
      picksCts?.dispose();
      picker.busy = false;

      const currentPicksDisposables = new DisposableStore();
      picksDisposable.current = currentPicksDisposables;
      picksCts = currentPicksDisposables.add(new CancellationTokenSource());
      currentPicksDisposables.add(token.onCancellationRequested(() => picksCts?.cancel()));

      const picksToken = picksCts.token;
      let filter = picker.value.substring(this.prefix.length);
      if (!this.options?.shouldSkipTrimPickFilter) {
        filter = filter.trim();
      }

      try {
        const providedPicks = await this._getPicks(filter, currentPicksDisposables, picksToken, runOptions);
        if (picksToken.isCancellationRequested) {
          return;
        }

        if (isFastAndSlowPicks(providedPicks)) {
          await this.applyFastAndSlowPicks(picker, providedPicks, filter, picksToken);
          return;
        }

        this.applyPicks(picker, providedPicks, filter);
      } finally {
        picker.busy = false;
      }
    };

    disposables.add(picker.onDidChangeValue(() => {
      void updatePickerItems();
    }));
    disposables.add(picker.onDidAccept(event => {
      const [item] = picker.selectedItems.length ? picker.selectedItems : picker.activeItems;
      if (!item) {
        return;
      }

      runOptions?.handleAccept?.(item, event.inBackground);
      if (isKeyModified(event.keyMods) && item.attach) {
        void item.attach(event.keyMods, event);
        return;
      }

      void item.accept?.(event.keyMods, event);
    }));
    disposables.add(picker.onDidTriggerItemButton(event => {
      void this.handleTrigger(picker, event.item, event.buttonIndex, event.keyMods);
    }));
    disposables.add(picker.onDidTriggerSeparatorButton(event => {
      const separator = event.separator as IPickerQuickAccessSeparator;
      if (separator.trigger) {
        void this.handleTrigger(picker, separator, event.buttonIndex, event.keyMods);
      }
    }));
    disposables.add(token.onCancellationRequested(() => {
      picksCts?.cancel();
    }));

    void updatePickerItems();
    return disposables;
  }

  protected getPicks(filter: string): readonly T[] | Promise<readonly T[]> {
    throw new Error(`Quick access provider must implement getPicks() or _getPicks(): ${filter}`);
  }

  protected _getPicks(
    filter: string,
    _disposables: DisposableStore,
    _token: CancellationToken,
    _runOptions?: QuickAccessProviderRunOptions,
  ): Picks<T> | FastAndSlowPicks<T> | Promise<Picks<T> | FastAndSlowPicks<T>> {
    return this.getPicks(filter);
  }

  private async provideForFilter(
    filter: string,
    runOptions?: QuickAccessProviderRunOptions,
  ): Promise<readonly T[]> {
    const disposables = new DisposableStore();
    try {
      const picks = await this._getPicks(filter.trim(), disposables, CancellationToken.None, runOptions);
      if (isFastAndSlowPicks(picks)) {
        const fastPicks = flattenPicks(picks.picks);
        const slowPicks = flattenPicks(await picks.additionalPicks);
        return [...fastPicks, ...slowPicks];
      }

      return flattenPicks(picks);
    } finally {
      disposables.dispose();
    }
  }

  private async applyFastAndSlowPicks(
    picker: IQuickPick<T, { useSeparators: true }>,
    fastAndSlowPicks: FastAndSlowPicks<T>,
    filter: string,
    token: CancellationToken,
  ): Promise<void> {
    let fastApplied = false;
    const applyFastPicks = async (): Promise<void> => {
      if (typeof fastAndSlowPicks.mergeDelay === "number") {
        await new Promise<void>(resolve => setTimeout(resolve, fastAndSlowPicks.mergeDelay));
      }
      if (!token.isCancellationRequested) {
        this.applyPicks(picker, fastAndSlowPicks.picks, filter, true);
        fastApplied = true;
      }
    };

    const applySlowPicks = async (): Promise<void> => {
      const slowPicks = await fastAndSlowPicks.additionalPicks;
      if (token.isCancellationRequested) {
        return;
      }

      const items = [
        ...flattenPicks(fastApplied ? picker.items : fastAndSlowPicks.picks),
        ...flattenPicks(slowPicks),
      ];
      this.applyPicks(picker, items, filter);
    };

    picker.busy = true;
    await Promise.all([applyFastPicks(), applySlowPicks()]);
  }

  private applyPicks(
    picker: IQuickPick<T, { useSeparators: true }>,
    picks: Picks<T>,
    filter: string,
    skipEmpty = false,
  ): void {
    const { items, active } = normalizePicks(picks);
    let nextItems = items;
    if (!nextItems.length) {
      if (skipEmpty) {
        return;
      }

      const noResultsPick = this.options?.noResultsPick;
      if ((filter.length > 0 || picker.hideInput) && noResultsPick) {
        nextItems = [typeof noResultsPick === "function" ? noResultsPick(filter) : noResultsPick];
      }
    }

    picker.items = nextItems;
    if (active) {
      picker.activeItems = [active];
    }
  }

  private async handleTrigger(
    picker: IQuickPick<T, { useSeparators: true }>,
    item: { trigger?: (buttonIndex: number, keyMods: IKeyMods) => TriggerAction | Promise<TriggerAction> },
    buttonIndex: number,
    keyMods: IKeyMods,
  ): Promise<void> {
    const action = item.trigger?.(buttonIndex, keyMods) ?? TriggerAction.NO_ACTION;
    const resolvedAction = isThenable<TriggerAction>(action) ? await action : action;
    switch (resolvedAction) {
      case TriggerAction.CLOSE_PICKER:
        picker.hide();
        break;
      case TriggerAction.REFRESH_PICKER:
        picker.value = picker.value;
        break;
      case TriggerAction.REMOVE_ITEM:
        picker.items = picker.items.filter(candidate => candidate !== item);
        break;
    }
  }
}

const normalizePicks = <T extends IPickerQuickAccessItem>(
  picks: Picks<T>,
): PicksWithActive<T> => {
  if (isPicksWithActive(picks)) {
    return picks;
  }

  return { items: picks };
};

const isPicksWithActive = <T extends IPickerQuickAccessItem>(
  picks: Picks<T>,
): picks is PicksWithActive<T> =>
  !Array.isArray(picks);

const flattenPicks = <T extends IPickerQuickAccessItem>(
  picks: Picks<T>,
): readonly T[] =>
  normalizePicks(picks).items.filter((item): item is T => !isQuickPickSeparator(item));

const isFastAndSlowPicks = <T extends IPickerQuickAccessItem>(
  value: unknown,
): value is FastAndSlowPicks<T> => {
  const candidate = value as Partial<FastAndSlowPicks<T>>;
  return !!candidate.picks && candidate.additionalPicks instanceof Promise;
};

const isQuickPickSeparator = (item: unknown): item is IQuickPickSeparator =>
  typeof item === "object" && item !== null && (item as IQuickPickSeparator).type === "separator";
