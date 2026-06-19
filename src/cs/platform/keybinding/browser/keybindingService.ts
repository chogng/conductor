/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from "src/cs/base/browser/dom";
import { mainWindow } from "src/cs/base/browser/window";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  createKeybindingFromKeyboardEvent,
  keybindingEquals,
  type IKeyboardEventLike,
  type SimpleKeybinding,
} from "src/cs/base/common/keybindings";
import { KeyCode } from "src/cs/base/common/keyCodes";
import { ICommandService, type ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import { IContextKeyService, type IContextKeyService as IContextKeyServiceType } from "src/cs/platform/contextkey/common/contextkey";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IKeybindingService,
  type IKeyboardDispatchEvent,
  type IKeybindingService as IKeybindingServiceType,
} from "src/cs/platform/keybinding/common/keybinding";
import { KeybindingsRegistry } from "src/cs/platform/keybinding/common/keybindingsRegistry";

export class BrowserKeybindingService extends Disposable implements IKeybindingServiceType {
  public declare readonly _serviceBrand: undefined;

  public constructor(
    @ICommandService private readonly commandService: ICommandServiceType,
    @IContextKeyService private readonly contextKeyService: IContextKeyServiceType,
  ) {
    super();

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

  public dispatchEvent(event: IKeyboardDispatchEvent): boolean {
    if (event.defaultPrevented || event.isComposing) {
      return false;
    }

    const keybinding = this.resolveKeyboardEvent(event);
    if (!keybinding || shouldSkipKeyboardEvent(event, keybinding)) {
      return false;
    }

    const matched = this.findMatchingKeybinding(keybinding);
    if (!matched) {
      return false;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    void this.commandService
      .executeCommand(matched.command, ...normalizeCommandArgs(matched.commandArgs))
      .catch(error => console.error(error));
    return true;
  }

  private findMatchingKeybinding(keybinding: SimpleKeybinding): {
    readonly command: string;
    readonly commandArgs?: unknown;
  } | undefined {
    const candidates = KeybindingsRegistry.getDefaultKeybindings();
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (!keybindingEquals(candidate.keybinding, keybinding)) {
        continue;
      }

      if (!this.contextKeyService.contextMatchesRules(candidate.when)) {
        continue;
      }

      return candidate;
    }

    return undefined;
  }
}

function normalizeCommandArgs(args: unknown): unknown[] {
  return args === undefined ? [] : [args];
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
  if (!(target instanceof Element)) {
    return false;
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true;
  }

  return target.getAttribute("contenteditable") === "true";
}

registerSingleton(IKeybindingService, BrowserKeybindingService, InstantiationType.Eager);
