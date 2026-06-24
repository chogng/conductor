import { CancellationToken, isCancellationError } from "src/cs/base/common/async";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import type { ILocalizedString } from "src/cs/platform/action/common/action";
import { ICommandService, type ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import {
  type FastAndSlowPicks,
  type IPickerQuickAccessItem,
  type IPickerQuickAccessProviderOptions,
  PickerQuickAccessProvider,
  type Picks,
} from "src/cs/platform/quickinput/browser/pickerQuickAccess";
import type { QuickAccessProviderRunOptions } from "src/cs/platform/quickinput/common/quickAccess";
import type { IKeyMods, IQuickPickDidAcceptEvent, IQuickPickSeparator } from "src/cs/platform/quickinput/common/quickInput";

export interface ICommandQuickPick extends IPickerQuickAccessItem {
  readonly commandId: string;
  readonly commandWhen?: string;
  readonly commandAlias?: string;
  readonly commandDescription?: ILocalizedString;
  readonly commandCategory?: string;
  readonly args?: readonly unknown[];
  readonly tfIdfScore?: number;
}

export interface ICommandsQuickAccessOptions extends IPickerQuickAccessProviderOptions<ICommandQuickPick> {
  readonly showAlias: boolean;
  suggestedCommandIds?: Set<string>;
}

export abstract class AbstractCommandsQuickAccessProvider extends PickerQuickAccessProvider<ICommandQuickPick> {
  public static readonly PREFIX = ">";

  protected override readonly options: ICommandsQuickAccessOptions;
  private readonly commandsHistory = new CommandsHistory();

  public constructor(
    options: ICommandsQuickAccessOptions,
    @ICommandService private readonly commandService: ICommandServiceType,
  ) {
    super(AbstractCommandsQuickAccessProvider.PREFIX, options);
    this.options = options;
  }

  protected override async _getPicks(
    filter: string,
    _disposables: DisposableStore,
    token: CancellationToken,
    runOptions?: QuickAccessProviderRunOptions,
  ): Promise<Picks<ICommandQuickPick> | FastAndSlowPicks<ICommandQuickPick>> {
    const allCommandPicks = await this.getCommandPicks(token);
    if (token.isCancellationRequested) {
      return [];
    }

    const filteredCommandPicks = this.filterCommandPicks(allCommandPicks, filter);
    const commandPicksWithDescriptions = this.withDuplicateLabelDescriptions(filteredCommandPicks);
    commandPicksWithDescriptions.sort((first, second) => this.compareCommandPicks(first, second));

    const commandPicks: Array<ICommandQuickPick | IQuickPickSeparator> = [];
    let addedRecentlyUsedSeparator = false;
    let addedOtherSeparator = false;
    for (const commandPick of commandPicksWithDescriptions) {
      const isInHistory = this.commandsHistory.has(commandPick.commandId);
      if (isInHistory && !addedRecentlyUsedSeparator) {
        commandPicks.push({ type: "separator", label: localize("quickAccess.commands.recentlyUsed", "recently used") });
        addedRecentlyUsedSeparator = true;
      }
      if (!isInHistory && addedRecentlyUsedSeparator && !addedOtherSeparator) {
        commandPicks.push({ type: "separator", label: localize("quickAccess.commands.other", "other commands") });
        addedOtherSeparator = true;
      }

      commandPicks.push(this.toCommandPick(commandPick, runOptions));
    }

    if (!this.hasAdditionalCommandPicks(filter, token)) {
      return commandPicks;
    }

    return {
      picks: commandPicks,
      additionalPicks: this.getAdditionalCommandPicks(allCommandPicks, commandPicksWithDescriptions, filter, token),
    };
  }

  protected abstract getCommandPicks(token: CancellationToken): Promise<Array<ICommandQuickPick>>;

  protected hasAdditionalCommandPicks(_filter: string, _token: CancellationToken): boolean {
    return false;
  }

  protected async getAdditionalCommandPicks(
    _allPicks: ICommandQuickPick[],
    _picksSoFar: ICommandQuickPick[],
    _filter: string,
    _token: CancellationToken,
  ): Promise<Array<ICommandQuickPick | IQuickPickSeparator>> {
    return [];
  }

  private filterCommandPicks(
    commandPicks: readonly ICommandQuickPick[],
    filter: string,
  ): ICommandQuickPick[] {
    const normalizedFilter = filter.trim().toLowerCase();
    if (!normalizedFilter) {
      return [...commandPicks];
    }

    return commandPicks.filter(commandPick => {
      const searchable = [
        commandPick.label,
        commandPick.commandAlias ?? "",
        commandPick.commandId,
        commandPick.commandCategory ?? "",
        commandPick.commandDescription?.value ?? "",
        commandPick.commandDescription?.original ?? "",
      ].join(" ").toLowerCase();
      return searchable.includes(normalizedFilter);
    });
  }

  private withDuplicateLabelDescriptions(
    commandPicks: readonly ICommandQuickPick[],
  ): ICommandQuickPick[] {
    const labelCounts = new Map<string, number>();
    for (const commandPick of commandPicks) {
      labelCounts.set(commandPick.label, (labelCounts.get(commandPick.label) ?? 0) + 1);
    }

    return commandPicks.map(commandPick =>
      labelCounts.get(commandPick.label)! > 1
        ? { ...commandPick, description: commandPick.description || commandPick.commandId }
        : commandPick,
    );
  }

  private compareCommandPicks(
    first: ICommandQuickPick,
    second: ICommandQuickPick,
  ): number {
    const firstHistory = this.commandsHistory.peek(first.commandId);
    const secondHistory = this.commandsHistory.peek(second.commandId);
    if (firstHistory && secondHistory && firstHistory !== secondHistory) {
      return secondHistory - firstHistory;
    }
    if (firstHistory) {
      return -1;
    }
    if (secondHistory) {
      return 1;
    }

    const firstSuggested = this.options.suggestedCommandIds?.has(first.commandId) ?? false;
    const secondSuggested = this.options.suggestedCommandIds?.has(second.commandId) ?? false;
    if (firstSuggested !== secondSuggested) {
      return firstSuggested ? -1 : 1;
    }

    return first.label.localeCompare(second.label, undefined, { sensitivity: "base" });
  }

  private toCommandPick(
    commandPick: ICommandQuickPick,
    _runOptions?: QuickAccessProviderRunOptions,
  ): ICommandQuickPick {
    return {
      ...commandPick,
      detail: this.options.showAlias && commandPick.commandAlias !== commandPick.label
        ? commandPick.commandAlias
        : commandPick.detail,
      tooltip: commandPick.tooltip ?? commandPick.commandDescription?.value,
      accept: async (keyMods, event) => {
        await this.acceptCommand(commandPick, keyMods, event);
      },
    };
  }

  private async acceptCommand(
    commandPick: ICommandQuickPick,
    _keyMods: IKeyMods,
    _event: IQuickPickDidAcceptEvent,
  ): Promise<void> {
    if (!commandPick.commandId) {
      return;
    }

    this.commandsHistory.push(commandPick.commandId);
    try {
      if (commandPick.args?.length) {
        await this.commandService.executeCommand(commandPick.commandId, ...commandPick.args);
        return;
      }

      await this.commandService.executeCommand(commandPick.commandId);
    } catch (error) {
      if (!isCancellationError(error)) {
        console.error(`Command '${commandPick.label}' resulted in an error`, error);
      }
    }
  }
}

export class CommandsHistory {
  private static readonly cache = new Map<string, number>();
  private static counter = 1;

  public push(commandId: string): void {
    CommandsHistory.cache.set(commandId, CommandsHistory.counter);
    CommandsHistory.counter += 1;
  }

  public peek(commandId: string): number | undefined {
    return CommandsHistory.cache.get(commandId);
  }

  public has(commandId: string): boolean {
    return CommandsHistory.cache.has(commandId);
  }

  public remove(commandId: string): void {
    CommandsHistory.cache.delete(commandId);
  }

  public static clearHistory(): void {
    CommandsHistory.cache.clear();
    CommandsHistory.counter = 1;
  }
}
