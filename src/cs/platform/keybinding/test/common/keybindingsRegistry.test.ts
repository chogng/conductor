import assert from "assert";

import { KeyChord, KeyCode, KeyMod } from "src/cs/base/common/keyCodes";
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
      item.keybinding[0]?.keyCode === KeyCode.KeyP &&
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
    assert.equal(item.keybinding[0]?.keyCode, KeyCode.KeyP);
    assert.equal(
      item.keybinding[0]?.metaKey,
      getCurrentKeybindingPlatform() === "mac",
    );
    assert.equal(
      item.keybinding[0]?.ctrlKey,
      getCurrentKeybindingPlatform() !== "mac",
    );

    disposable.dispose();
  });

  test("resolves chord keybindings", () => {
    const id = newTestCommandId();
    const disposable = store.add(KeybindingsRegistry.registerKeybindingRule({
      id,
      primary: KeyChord(
        KeyMod.CtrlCmd | KeyCode.KeyK,
        KeyMod.CtrlCmd | KeyCode.KeyS,
      ),
      weight: KeybindingWeight.WorkbenchContrib,
    }));

    const item = KeybindingsRegistry
      .getDefaultKeybindingsForPlatform(getCurrentKeybindingPlatform())
      .find(candidate => candidate.command === id);

    assert.ok(item);
    assert.equal(item.keybinding.length, 2);
    assert.equal(item.keybinding[0]?.keyCode, KeyCode.KeyK);
    assert.equal(item.keybinding[1]?.keyCode, KeyCode.KeyS);

    disposable.dispose();
  });
});

function newTestCommandId(): string {
  testCommandCounter += 1;
  return `test.keybinding.${testCommandCounter}`;
}
