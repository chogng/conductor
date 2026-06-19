import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { KeyCode, KeyMod } from "src/cs/base/common/keyCodes";
import { getCurrentKeybindingPlatform } from "src/cs/base/common/keybindings";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { type ICommandEvent, type ICommandService } from "src/cs/platform/commands/common/commands";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import { BrowserKeybindingService } from "src/cs/platform/keybinding/browser/keybindingService";
import {
  KeybindingsRegistry,
  KeybindingWeight,
} from "src/cs/platform/keybinding/common/keybindingsRegistry";
import type { IKeyboardDispatchEvent } from "src/cs/platform/keybinding/common/keybinding";

suite("platform/keybinding/browser/keybindingService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("dispatches matching context-aware keybindings", () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const keybindingService = disposables.add(new BrowserKeybindingService(
      createCommandService(commands),
      contextKeyService,
    ));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.dispatch",
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.WorkbenchContrib,
      when: ContextKeyExpr.has("dispatchEnabled"),
    }));

    assert.equal(keybindingService.dispatchEvent(createCtrlCmdEvent("KeyP", "p")), false);
    assert.deepEqual(commands, []);

    contextKeyService.setContext("dispatchEnabled", true);
    const event = createCtrlCmdEvent("KeyP", "p");

    assert.equal(keybindingService.dispatchEvent(event), true);
    assert.equal(event.prevented, true);
    assert.deepEqual(commands, [{ id: "test.dispatch", args: [] }]);
  });

  test("dispatches the highest-weight matching keybinding", () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const keybindingService = disposables.add(new BrowserKeybindingService(
      createCommandService(commands),
      contextKeyService,
    ));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.lowWeight",
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.EditorContrib,
    }));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.highWeight",
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.WorkbenchContrib,
    }));

    assert.equal(keybindingService.dispatchEvent(createCtrlCmdEvent("KeyP", "p")), true);
    assert.deepEqual(commands, [{ id: "test.highWeight", args: [] }]);
  });
});

type TestKeyboardDispatchEvent = IKeyboardDispatchEvent & {
  prevented: boolean;
  stopped: boolean;
};

function createCtrlCmdEvent(code: string, key: string): TestKeyboardDispatchEvent {
  const isMac = getCurrentKeybindingPlatform() === "mac";
  return {
    altKey: false,
    code,
    ctrlKey: !isMac,
    key,
    metaKey: isMac,
    prevented: false,
    shiftKey: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
}

function createCommandService(
  commands: Array<{ id: string; args: readonly unknown[] }>,
): ICommandService {
  return {
    _serviceBrand: undefined,
    onDidExecuteCommand: Event.None as Event<ICommandEvent>,
    onWillExecuteCommand: Event.None as Event<ICommandEvent>,
    executeCommand: async <R = unknown>(commandId: string, ...args: unknown[]): Promise<R | undefined> => {
      commands.push({ id: commandId, args });
      return undefined;
    },
  };
}

