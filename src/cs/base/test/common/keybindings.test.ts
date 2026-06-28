import assert from "assert";

import { keyCodeFromKeyboardEvent } from "../../common/keybindings.ts";
import { KeyCode } from "../../common/keyCodes.ts";

suite("base/test/common/keybindings", () => {
  test("keyCodeFromKeyboardEvent parses list controller keys", () => {
    assert.equal(keyCodeFromKeyboardEvent(key("ContextMenu")), KeyCode.ContextMenu);
    assert.equal(keyCodeFromKeyboardEvent(key("Numpad7")), KeyCode.Numpad7);
    assert.equal(keyCodeFromKeyboardEvent(key("KeyG")), KeyCode.KeyG);
  });
});

function key(code: string): {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
} {
  return {
    altKey: false,
    code,
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
  };
}
