/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from "src/cs/base/browser/dom";
import { mainWindow } from "src/cs/base/browser/window";
import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import {
  createKeybindingFromKeyboardEvent,
  formatKeybinding,
  keybindingEquals,
  keybindingStartsWith,
  type IKeyboardEventLike,
  type Keybinding,
  type SimpleKeybinding,
} from "src/cs/base/common/keybindings";
import { KeybindingParser } from "src/cs/base/common/keybindingParser";
import { KeyCode } from "src/cs/base/common/keyCodes";
import { ICommandService, type ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import {
  ConfigurationTarget,
  IConfigurationService,
  type IConfigurationService as IConfigurationServiceType,
} from "src/cs/platform/configuration/common/configuration";
import { IContextKeyService, type IContextKeyService as IContextKeyServiceType } from "src/cs/platform/contextkey/common/contextkey";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  type IKeybindingConflict,
  IKeybindingService,
  type IKeyboardDispatchEvent,
  type IKeybindingService as IKeybindingServiceType,
  type IResolvedKeybindingItem,
  type IUserFriendlyKeybinding,
} from "src/cs/platform/keybinding/common/keybinding";
import {
  KeybindingsRegistry,
  KeybindingWeight,
  type IKeybindingItem,
} from "src/cs/platform/keybinding/common/keybindingsRegistry";
import { KEYBOARD_KEYBINDINGS_CONFIGURATION_KEY } from "src/cs/workbench/services/keybinding/common/keybindingConfiguration";

const CHORD_TIMEOUT_MS = 5000;
const USER_KEYBINDING_WEIGHT = KeybindingWeight.ExternalExtension + 100;

interface IUserKeybindingRemoval {
  readonly keybinding: Keybinding;
  readonly command: string;
  readonly when?: string;
}

type KeybindingResolution =
  | { readonly kind: "none" }
  | { readonly kind: "more" }
  | { readonly kind: "match"; readonly item: IResolvedKeybindingItem };

export class WorkbenchKeybindingService extends Disposable implements IKeybindingServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidUpdateKeybindingsEmitter = this._register(new Emitter<void>());
  public readonly onDidUpdateKeybindings = this.onDidUpdateKeybindingsEmitter.event;
  private userKeybindingItems: IResolvedKeybindingItem[] = [];
  private userKeybindingRemovals: IUserKeybindingRemoval[] = [];
  private currentChords: SimpleKeybinding[] = [];
  private chordTimeout: ReturnType<typeof setTimeout> | undefined;

  public get inChordMode(): boolean {
    return this.currentChords.length > 0;
  }

  public constructor(
    @ICommandService private readonly commandService: ICommandServiceType,
    @IContextKeyService private readonly contextKeyService: IContextKeyServiceType,
    @IConfigurationService private readonly configurationService: IConfigurationServiceType,
  ) {
    super();

    this.reloadUserKeybindings();
    this._register(this.configurationService.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration(KEYBOARD_KEYBINDINGS_CONFIGURATION_KEY)) {
        return;
      }

      this.reloadUserKeybindings();
      this.onDidUpdateKeybindingsEmitter.fire();
    }));
    this._register(toDisposable(() => this.clearChordTimeout()));

    if (typeof mainWindow !== "undefined") {
      this._register(addDisposableListener(
        mainWindow,
        "keydown",
        event => this.dispatchEvent(event),
        true,
      ));
    }
  }

  public resolveKeyboardEvent(event: IKeyboardEventLike): SimpleKeybinding | null {
    return createKeybindingFromKeyboardEvent(event);
  }

  public getKeybindings(): readonly IResolvedKeybindingItem[] {
    const defaultItems = KeybindingsRegistry
      .getDefaultKeybindings()
      .map(defaultItemToResolvedItem);
    const activeDefaultItems = defaultItems.filter(item => !this.isRemovedDefaultKeybinding(item));
    return [...activeDefaultItems, ...this.userKeybindingItems].sort(compareResolvedKeybindingItems);
  }

  public getKeybindingConflicts(): readonly IKeybindingConflict[] {
    const groups = new Map<string, IResolvedKeybindingItem[]>();
    for (const item of this.getKeybindings()) {
      const key = formatKeybinding(item.keybinding);
      const group = groups.get(key);
      if (group) {
        group.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    const conflicts: IKeybindingConflict[] = [];
    for (const [key, items] of groups) {
      const commands = [...new Set(items.map(item => item.command))];
      if (commands.length <= 1) {
        continue;
      }

      conflicts.push({ key, items, commands });
    }

    return conflicts.sort((first, second) => first.key.localeCompare(second.key));
  }

  public async updateUserKeybindings(keybindings: readonly IUserFriendlyKeybinding[]): Promise<void> {
    await this.configurationService.updateValue(
      KEYBOARD_KEYBINDINGS_CONFIGURATION_KEY,
      keybindings.map(normalizeUserFriendlyKeybinding),
      ConfigurationTarget.USER,
    );
    this.reloadUserKeybindings();
    this.onDidUpdateKeybindingsEmitter.fire();
  }

  public dispatchEvent(event: IKeyboardDispatchEvent): boolean {
    if (event.defaultPrevented || event.isComposing) {
      return false;
    }

    const keybinding = this.resolveKeyboardEvent(event);
    if (!keybinding || (!this.inChordMode && shouldSkipKeyboardEvent(event, keybinding))) {
      return false;
    }

    const sequence = [...this.currentChords, keybinding];
    const resolution = this.resolveKeybindingSequence(sequence);

    if (resolution.kind === "none") {
      if (!this.inChordMode) {
        return false;
      }

      this.leaveChordMode();
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    }

    if (resolution.kind === "more") {
      this.enterChordMode(sequence);
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    }

    this.leaveChordMode();
    event.preventDefault?.();
    event.stopPropagation?.();

    void this.commandService
      .executeCommand(resolution.item.command, ...normalizeCommandArgs(resolution.item.commandArgs))
      .catch(error => console.error(error));
    return true;
  }

  private resolveKeybindingSequence(sequence: Keybinding): KeybindingResolution {
    const candidates = this.getKeybindings();
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (!keybindingStartsWith(candidate.keybinding, sequence)) {
        continue;
      }

      if (!this.contextKeyService.contextMatchesRules(candidate.when)) {
        continue;
      }

      if (candidate.keybinding.length > sequence.length) {
        return { kind: "more" };
      }

      return { kind: "match", item: candidate };
    }

    return { kind: "none" };
  }

  private enterChordMode(sequence: Keybinding): void {
    this.currentChords = [...sequence];
    this.clearChordTimeout();
    this.chordTimeout = setTimeout(() => this.leaveChordMode(), CHORD_TIMEOUT_MS);
  }

  private leaveChordMode(): void {
    this.currentChords = [];
    this.clearChordTimeout();
  }

  private clearChordTimeout(): void {
    if (this.chordTimeout === undefined) {
      return;
    }

    clearTimeout(this.chordTimeout);
    this.chordTimeout = undefined;
  }

  private reloadUserKeybindings(): void {
    const parsed = parseUserKeybindingRules(
      this.configurationService.getValue<unknown>(KEYBOARD_KEYBINDINGS_CONFIGURATION_KEY),
    );
    this.userKeybindingItems = parsed.items;
    this.userKeybindingRemovals = parsed.removals;
  }

  private isRemovedDefaultKeybinding(item: IResolvedKeybindingItem): boolean {
    return this.userKeybindingRemovals.some(removal =>
      removal.command === item.command &&
      keybindingEquals(removal.keybinding, item.keybinding) &&
      (!removal.when || removal.when === contextKeyRulesToString(item.when))
    );
  }
}

function normalizeCommandArgs(args: unknown): unknown[] {
  return args === undefined ? [] : [args];
}

function defaultItemToResolvedItem(item: IKeybindingItem): IResolvedKeybindingItem {
  return {
    ...item,
    source: "default",
    isDefault: true,
  };
}

function parseUserKeybindingRules(value: unknown): {
  readonly items: IResolvedKeybindingItem[];
  readonly removals: IUserKeybindingRemoval[];
} {
  if (!Array.isArray(value)) {
    return { items: [], removals: [] };
  }

  const items: IResolvedKeybindingItem[] = [];
  const removals: IUserKeybindingRemoval[] = [];

  for (const rule of value) {
    if (!isUserFriendlyKeybinding(rule)) {
      continue;
    }

    const keybinding = KeybindingParser.parseKeybinding(rule.key);
    if (!keybinding) {
      continue;
    }

    const when = typeof rule.when === "string" && rule.when.trim()
      ? rule.when.trim()
      : undefined;
    if (rule.command.startsWith("-")) {
      const command = rule.command.slice(1).trim();
      if (command) {
        removals.push({ command, keybinding, when });
      }
      continue;
    }

    items.push({
      keybinding,
      command: rule.command,
      commandArgs: rule.args,
      when,
      weight1: USER_KEYBINDING_WEIGHT,
      weight2: items.length,
      source: "user",
      isDefault: false,
    });
  }

  return { items, removals };
}

function normalizeUserFriendlyKeybinding(rule: IUserFriendlyKeybinding): IUserFriendlyKeybinding {
  return {
    key: rule.key,
    command: rule.command,
    ...(rule.when === undefined ? {} : { when: rule.when }),
    ...(rule.args === undefined ? {} : { args: rule.args }),
  };
}

function isUserFriendlyKeybinding(value: unknown): value is IUserFriendlyKeybinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<IUserFriendlyKeybinding>;
  return typeof candidate.key === "string" &&
    candidate.key.trim().length > 0 &&
    typeof candidate.command === "string" &&
    candidate.command.trim().length > 0;
}

function compareResolvedKeybindingItems(
  first: IResolvedKeybindingItem,
  second: IResolvedKeybindingItem,
): number {
  if (first.weight1 !== second.weight1) {
    return first.weight1 - second.weight1;
  }

  if (first.command !== second.command) {
    return first.command.localeCompare(second.command);
  }

  return first.weight2 - second.weight2;
}

function contextKeyRulesToString(rules: IResolvedKeybindingItem["when"]): string | undefined {
  if (!rules) {
    return undefined;
  }

  return typeof rules === "string" ? rules : JSON.stringify(rules);
}

function shouldSkipKeyboardEvent(
  event: IKeyboardDispatchEvent,
  keybinding: SimpleKeybinding,
): boolean {
  if (keybinding.ctrlKey || keybinding.altKey || keybinding.metaKey) {
    return false;
  }

  if (keybinding.keyCode >= KeyCode.F1 && keybinding.keyCode <= KeyCode.F12) {
    return false;
  }

  return isEditableTarget(event.target);
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true;
  }

  return target.getAttribute("contenteditable") === "true";
}

registerSingleton(IKeybindingService, WorkbenchKeybindingService, InstantiationType.Eager);
