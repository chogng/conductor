import assert from "assert";

import { KeyCode, KeyMod } from "src/cs/base/common/keyCodes";
import { getCurrentKeybindingPlatform } from "src/cs/base/common/keybindings";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  KeybindingsRegistry,
  KeybindingWeight,
} from "src/cs/platform/keybinding/common/keybindingsRegistry";

let testCommandCounter = 0;

suite("platform/keybinding/common/keybindingsRegistry", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("registerAction2 registers keybinding rules", () => {
    const id = newTestCommandId();
    const disposable = store.add(registerAction2(class TestKeybindingAction extends Action2 {
      public constructor() {
        super({
          f1: false,
          id,
          keybinding: {
            primary: KeyMod.CtrlCmd | KeyCode.KeyP,
            weight: KeybindingWeight.WorkbenchContrib,
          },
          title: "Test Keybinding",
        });
      }

      public run(_accessor: ServicesAccessor): void {}
    }));

    assert.ok(KeybindingsRegistry.getDefaultKeybindings().some(item =>
      item.command === id &&
      item.keybinding.keyCode === KeyCode.KeyP &&
      item.weight1 === KeybindingWeight.WorkbenchContrib
    ));

    disposable.dispose();
    assert.equal(
      KeybindingsRegistry.getDefaultKeybindings().some(item => item.command === id),
      false,
    );
  });

  test("resolves CtrlCmd for platform-specific default keybindings", () => {
    const id = newTestCommandId();
    const disposable = store.add(KeybindingsRegistry.registerKeybindingRule({
      id,
      primary: KeyMod.CtrlCmd | KeyCode.KeyP,
      weight: KeybindingWeight.WorkbenchContrib,
    }));

    const item = KeybindingsRegistry
      .getDefaultKeybindingsForPlatform(getCurrentKeybindingPlatform())
      .find(candidate => candidate.command === id);

    assert.ok(item);
    assert.equal(item.keybinding.keyCode, KeyCode.KeyP);
    assert.equal(
      item.keybinding.metaKey,
      getCurrentKeybindingPlatform() === "mac",
    );
    assert.equal(
      item.keybinding.ctrlKey,
      getCurrentKeybindingPlatform() !== "mac",
    );

    disposable.dispose();
  });
});

function newTestCommandId(): string {
  testCommandCounter += 1;
  return `test.keybinding.${testCommandCounter}`;
}

