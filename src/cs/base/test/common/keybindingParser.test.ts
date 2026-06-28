import assert from "assert";

import { KeybindingParser } from "../../common/keybindingParser.ts";
import { KeyCode } from "../../common/keyCodes.ts";

suite("base/test/common/keybindingParser", () => {
  test("parses user keybindings", () => {
    assert.deepEqual(KeybindingParser.parseKeybinding("Ctrl+Shift+P"), [{
      altKey: false,
      ctrlKey: true,
      keyCode: KeyCode.KeyP,
      metaKey: false,
      shiftKey: true,
    }]);
  });

  test("parses chorded user keybindings", () => {
    assert.deepEqual(KeybindingParser.parseKeybinding("Ctrl+K Ctrl+S"), [
      {
        altKey: false,
        ctrlKey: true,
        keyCode: KeyCode.KeyK,
        metaKey: false,
        shiftKey: false,
      },
      {
        altKey: false,
        ctrlKey: true,
        keyCode: KeyCode.KeyS,
        metaKey: false,
        shiftKey: false,
      },
    ]);
  });

  test("parses concrete command and meta modifiers", () => {
    assert.deepEqual(KeybindingParser.parseKeybinding("cmd+p")?.[0], {
      altKey: false,
      ctrlKey: false,
      keyCode: KeyCode.KeyP,
      metaKey: true,
      shiftKey: false,
    });
    assert.deepEqual(KeybindingParser.parseKeybinding("win+p")?.[0], {
      altKey: false,
      ctrlKey: false,
      keyCode: KeyCode.KeyP,
      metaKey: true,
      shiftKey: false,
    });
  });

  test("parses upstream hyphen modifier separators", () => {
    assert.deepEqual(KeybindingParser.parseKeybinding("ctrl-shift-a")?.[0], {
      altKey: false,
      ctrlKey: true,
      keyCode: KeyCode.KeyA,
      metaKey: false,
      shiftKey: true,
    });
  });

  test("rejects empty or modifier-only keybindings", () => {
    assert.equal(KeybindingParser.parseKeybinding(""), null);
    assert.equal(KeybindingParser.parseKeybinding("Ctrl+Shift"), null);
  });

  test("rejects symbolic platform modifiers", () => {
    assert.equal(KeybindingParser.parseKeybinding("cmdOrCtrl+p"), null);
    assert.equal(KeybindingParser.parseKeybinding("winCtrl+p"), null);
  });
});
