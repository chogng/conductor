/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IKeyboardEventLike, Keybinding, SimpleKeybinding } from "src/cs/base/common/keybindings";
import type { Event } from "src/cs/base/common/event";
import type { ContextKeyRules } from "src/cs/platform/contextkey/common/contextkey";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export interface IUserFriendlyKeybinding {
  readonly key: string;
  readonly command: string;
  readonly args?: unknown;
  readonly when?: string;
}

export interface IKeyboardDispatchEvent extends IKeyboardEventLike {
  readonly defaultPrevented?: boolean;
  readonly isComposing?: boolean;
  readonly target?: EventTarget | null;
  preventDefault?(): void;
  stopPropagation?(): void;
}

export type KeybindingSource = "default" | "user";

export interface IResolvedKeybindingItem {
  readonly keybinding: Keybinding;
  readonly command: string;
  readonly commandArgs?: unknown;
  readonly when?: ContextKeyRules;
  readonly weight1: number;
  readonly weight2: number;
  readonly source: KeybindingSource;
  readonly isDefault: boolean;
}

export interface IKeybindingConflict {
  readonly key: string;
  readonly items: readonly IResolvedKeybindingItem[];
  readonly commands: readonly string[];
}

export const IKeybindingService = createDecorator<IKeybindingService>("keybindingService");

export interface IKeybindingService {
  readonly _serviceBrand: undefined;
  readonly onDidUpdateKeybindings: Event<void>;
  readonly inChordMode: boolean;

  dispatchEvent(event: IKeyboardDispatchEvent): boolean;
  resolveKeyboardEvent(event: IKeyboardEventLike): SimpleKeybinding | null;
  getKeybindings(): readonly IResolvedKeybindingItem[];
  getKeybindingConflicts(): readonly IKeybindingConflict[];
  updateUserKeybindings(keybindings: readonly IUserFriendlyKeybinding[]): Promise<void>;
}
