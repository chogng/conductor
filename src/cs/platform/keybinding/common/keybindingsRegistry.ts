/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { LinkedList } from "src/cs/base/common/linkedList";
import {
  decodeKeybinding,
  getCurrentKeybindingPlatform,
  type KeybindingPlatform,
  type SimpleKeybinding,
} from "src/cs/base/common/keybindings";
import type { ContextKeyExpression } from "src/cs/platform/contextkey/common/contextkey";

export interface IKeybindings {
  readonly primary?: number;
  readonly secondary?: readonly number[];
  readonly mac?: {
    readonly primary?: number;
    readonly secondary?: readonly number[];
  };
  readonly win?: {
    readonly primary?: number;
    readonly secondary?: readonly number[];
  };
  readonly linux?: {
    readonly primary?: number;
    readonly secondary?: readonly number[];
  };
}

export interface IKeybindingRule extends IKeybindings {
  readonly id: string;
  readonly args?: unknown;
  readonly weight: number;
  readonly when?: ContextKeyExpression | null;
}

export interface IKeybindingItem {
  readonly keybinding: SimpleKeybinding;
  readonly command: string;
  readonly commandArgs?: unknown;
  readonly when?: ContextKeyExpression | null;
  readonly weight1: number;
  readonly weight2: number;
}

export const enum KeybindingWeight {
  EditorCore = 0,
  EditorContrib = 100,
  WorkbenchContrib = 200,
  BuiltinExtension = 300,
  ExternalExtension = 400,
}

export interface IKeybindingsRegistry {
  registerKeybindingRule(rule: IKeybindingRule): IDisposable;
  getDefaultKeybindings(): IKeybindingItem[];
  getDefaultKeybindingsForPlatform(platform: KeybindingPlatform): IKeybindingItem[];
}

class KeybindingsRegistryImpl implements IKeybindingsRegistry {
  private readonly keybindings = new LinkedList<IKeybindingItem>();
  private readonly rules = new LinkedList<IKeybindingRule>();
  private cachedKeybindings: IKeybindingItem[] | null = null;

  public registerKeybindingRule(rule: IKeybindingRule): IDisposable {
    const store = new DisposableStore();
    const keybindings = bindToPlatform(rule, getCurrentKeybindingPlatform());

    if (keybindings.primary) {
      store.add(this.registerDefaultKeybinding(keybindings.primary, rule, 0));
    }

    if (keybindings.secondary) {
      keybindings.secondary.forEach((keybinding, index) => {
        store.add(this.registerDefaultKeybinding(keybinding, rule, -index - 1));
      });
    }

    const removeRule = this.rules.push(rule);
    store.add(toDisposable(() => removeRule()));
    return store;
  }

  public getDefaultKeybindings(): IKeybindingItem[] {
    if (!this.cachedKeybindings) {
      this.cachedKeybindings = [...this.keybindings].sort(compareKeybindingItems);
    }

    return [...this.cachedKeybindings];
  }

  public getDefaultKeybindingsForPlatform(platform: KeybindingPlatform): IKeybindingItem[] {
    const result: IKeybindingItem[] = [];
    for (const rule of this.rules) {
      const keybindings = bindToPlatform(rule, platform);
      if (keybindings.primary) {
        const keybinding = decodeKeybinding(keybindings.primary, platform);
        if (keybinding) {
          result.push(createKeybindingItem(keybinding, rule, 0));
        }
      }

      keybindings.secondary?.forEach((secondary, index) => {
        const keybinding = decodeKeybinding(secondary, platform);
        if (keybinding) {
          result.push(createKeybindingItem(keybinding, rule, -index - 1));
        }
      });
    }

    return result.sort(compareKeybindingItems);
  }

  private registerDefaultKeybinding(
    encodedKeybinding: number,
    rule: IKeybindingRule,
    weight2: number,
  ): IDisposable {
    const keybinding = decodeKeybinding(encodedKeybinding);
    if (!keybinding) {
      return toDisposable(() => {});
    }

    const remove = this.keybindings.push(createKeybindingItem(keybinding, rule, weight2));
    this.cachedKeybindings = null;
    return toDisposable(() => {
      remove();
      this.cachedKeybindings = null;
    });
  }
}

export const KeybindingsRegistry: IKeybindingsRegistry = new KeybindingsRegistryImpl();

function bindToPlatform(
  keybindings: IKeybindings,
  platform: KeybindingPlatform,
): {
  readonly primary?: number;
  readonly secondary?: readonly number[];
} {
  if (platform === "mac" && keybindings.mac) {
    return keybindings.mac;
  }

  if (platform === "windows" && keybindings.win) {
    return keybindings.win;
  }

  if (platform === "linux" && keybindings.linux) {
    return keybindings.linux;
  }

  return keybindings;
}

function createKeybindingItem(
  keybinding: SimpleKeybinding,
  rule: IKeybindingRule,
  weight2: number,
): IKeybindingItem {
  return {
    keybinding,
    command: rule.id,
    commandArgs: rule.args,
    when: rule.when,
    weight1: rule.weight,
    weight2,
  };
}

function compareKeybindingItems(first: IKeybindingItem, second: IKeybindingItem): number {
  if (first.weight1 !== second.weight1) {
    return first.weight1 - second.weight1;
  }

  if (first.command !== second.command) {
    return first.command.localeCompare(second.command);
  }

  return first.weight2 - second.weight2;
}

