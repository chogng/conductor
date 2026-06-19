import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { KeyChord, KeyCode, KeyMod } from "src/cs/base/common/keyCodes";
import { getCurrentKeybindingPlatform } from "src/cs/base/common/keybindings";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { type ICommandEvent, type ICommandService } from "src/cs/platform/commands/common/commands";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { ContextKeyService } from "src/cs/platform/contextkey/browser/contextKeyService";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import {
  KeybindingsRegistry,
  KeybindingWeight,
} from "src/cs/platform/keybinding/common/keybindingsRegistry";
import type { IKeyboardDispatchEvent } from "src/cs/platform/keybinding/common/keybinding";
import { WorkbenchKeybindingService } from "src/cs/workbench/services/keybinding/browser/keybindingService";

suite("workbench/services/keybinding/browser/keybindingService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("dispatches matching context-aware keybindings", () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const configurationService = disposables.add(new ConfigurationService());
    const keybindingService = disposables.add(new WorkbenchKeybindingService(
      createCommandService(commands),
      contextKeyService,
      configurationService,
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
    const configurationService = disposables.add(new ConfigurationService());
    const keybindingService = disposables.add(new WorkbenchKeybindingService(
      createCommandService(commands),
      contextKeyService,
      configurationService,
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

  test("waits for the second key of a chord before dispatching", () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const configurationService = disposables.add(new ConfigurationService());
    const keybindingService = disposables.add(new WorkbenchKeybindingService(
      createCommandService(commands),
      contextKeyService,
      configurationService,
    ));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.chord",
      primary: KeyChord(
        KeyMod.CtrlCmd | KeyCode.KeyK,
        KeyMod.CtrlCmd | KeyCode.KeyS,
      ),
      weight: KeybindingWeight.WorkbenchContrib,
    }));

    assert.equal(keybindingService.dispatchEvent(createCtrlCmdEvent("KeyK", "k")), true);
    assert.equal(keybindingService.inChordMode, true);
    assert.deepEqual(commands, []);

    assert.equal(keybindingService.dispatchEvent(createCtrlCmdEvent("KeyS", "s")), true);
    assert.equal(keybindingService.inChordMode, false);
    assert.deepEqual(commands, [{ id: "test.chord", args: [] }]);
  });

  test("lets user keybindings override default keybindings", async () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const configurationService = disposables.add(new ConfigurationService());
    const keybindingService = disposables.add(new WorkbenchKeybindingService(
      createCommandService(commands),
      contextKeyService,
      configurationService,
    ));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.defaultOverride",
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.WorkbenchContrib,
    }));

    await keybindingService.updateUserKeybindings([{
      key: "ctrlcmd+p",
      command: "test.userOverride",
      args: { source: "user" },
    }]);

    assert.equal(keybindingService.dispatchEvent(createCtrlCmdEvent("KeyP", "p")), true);
    assert.deepEqual(commands, [{
      id: "test.userOverride",
      args: [{ source: "user" }],
    }]);
  });

  test("removes default keybindings through user rules", async () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const configurationService = disposables.add(new ConfigurationService());
    const keybindingService = disposables.add(new WorkbenchKeybindingService(
      createCommandService(commands),
      contextKeyService,
      configurationService,
    ));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.removeDefault",
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.WorkbenchContrib,
    }));

    await keybindingService.updateUserKeybindings([{
      key: "ctrlcmd+p",
      command: "-test.removeDefault",
    }]);

    assert.equal(keybindingService.dispatchEvent(createCtrlCmdEvent("KeyP", "p")), false);
    assert.deepEqual(commands, []);
  });

  test("reports effective keybinding conflicts", async () => {
    const disposables = store.add(new DisposableStore());
    const commands: Array<{ id: string; args: readonly unknown[] }> = [];
    const contextKeyService = disposables.add(new ContextKeyService());
    const configurationService = disposables.add(new ConfigurationService());
    const keybindingService = disposables.add(new WorkbenchKeybindingService(
      createCommandService(commands),
      contextKeyService,
      configurationService,
    ));
    disposables.add(KeybindingsRegistry.registerKeybindingRule({
      id: "test.conflictDefault",
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.WorkbenchContrib,
    }));
    await keybindingService.updateUserKeybindings([{
      key: "ctrlcmd+p",
      command: "test.conflictUser",
    }]);

    const conflict = keybindingService
      .getKeybindingConflicts()
      .find(candidate => candidate.commands.includes("test.conflictDefault"));

    assert.ok(conflict);
    assert.ok(conflict.commands.includes("test.conflictUser"));
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
