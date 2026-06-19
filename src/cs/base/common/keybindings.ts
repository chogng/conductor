/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isLinux, isMacintosh } from "src/cs/base/common/platform";
import { isModifierKey, KeyCode } from "src/cs/base/common/keyCodes";

const enum BinaryKeybindingsMask {
  CtrlCmd = (1 << 11) >>> 0,
  Shift = (1 << 10) >>> 0,
  Alt = (1 << 9) >>> 0,
  WinCtrl = (1 << 8) >>> 0,
  KeyCode = 0x000000ff,
}

export interface SimpleKeybinding {
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly keyCode: KeyCode;
}

export interface IKeyboardEventLike {
  readonly key?: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export type KeybindingPlatform = "mac" | "windows" | "linux";

export function getCurrentKeybindingPlatform(): KeybindingPlatform {
  if (isMacintosh) {
    return "mac";
  }

  return isLinux ? "linux" : "windows";
}

export function decodeKeybinding(
  keybinding: number,
  platform: KeybindingPlatform = getCurrentKeybindingPlatform(),
): SimpleKeybinding | null {
  if (!keybinding) {
    return null;
  }

  const secondChord = (keybinding & 0xffff0000) >>> 16;
  if (secondChord !== 0) {
    return null;
  }

  const ctrlCmd = Boolean(keybinding & BinaryKeybindingsMask.CtrlCmd);
  const winCtrl = Boolean(keybinding & BinaryKeybindingsMask.WinCtrl);
  return {
    ctrlKey: platform === "mac" ? winCtrl : ctrlCmd,
    shiftKey: Boolean(keybinding & BinaryKeybindingsMask.Shift),
    altKey: Boolean(keybinding & BinaryKeybindingsMask.Alt),
    metaKey: platform === "mac" ? ctrlCmd : winCtrl,
    keyCode: (keybinding & BinaryKeybindingsMask.KeyCode) as KeyCode,
  };
}

export function keybindingEquals(
  first: SimpleKeybinding,
  second: SimpleKeybinding,
): boolean {
  return first.ctrlKey === second.ctrlKey &&
    first.shiftKey === second.shiftKey &&
    first.altKey === second.altKey &&
    first.metaKey === second.metaKey &&
    first.keyCode === second.keyCode;
}

export function createKeybindingFromKeyboardEvent(
  event: IKeyboardEventLike,
): SimpleKeybinding | null {
  const keyCode = keyCodeFromKeyboardEvent(event);
  if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
    return null;
  }

  return {
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    keyCode,
  };
}

function keyCodeFromKeyboardEvent(event: IKeyboardEventLike): KeyCode {
  const code = event.code ?? "";
  if (code.startsWith("Key") && code.length === 4) {
    return keyCodeFromLetter(code.charAt(3));
  }

  if (code.startsWith("Digit") && code.length === 6) {
    return keyCodeFromDigit(code.charAt(5));
  }

  if (/^F\d{1,2}$/.test(code)) {
    return keyCodeFromFunctionKey(code);
  }

  switch (code) {
    case "Backspace": return KeyCode.Backspace;
    case "Tab": return KeyCode.Tab;
    case "Enter":
    case "NumpadEnter": return KeyCode.Enter;
    case "Escape": return KeyCode.Escape;
    case "Space": return KeyCode.Space;
    case "PageUp": return KeyCode.PageUp;
    case "PageDown": return KeyCode.PageDown;
    case "End": return KeyCode.End;
    case "Home": return KeyCode.Home;
    case "ArrowLeft": return KeyCode.LeftArrow;
    case "ArrowUp": return KeyCode.UpArrow;
    case "ArrowRight": return KeyCode.RightArrow;
    case "ArrowDown": return KeyCode.DownArrow;
    case "Insert": return KeyCode.Insert;
    case "Delete": return KeyCode.Delete;
    case "Semicolon": return KeyCode.Semicolon;
    case "Equal": return KeyCode.Equal;
    case "Comma": return KeyCode.Comma;
    case "Minus": return KeyCode.Minus;
    case "Period": return KeyCode.Period;
    case "Slash": return KeyCode.Slash;
    case "Backquote": return KeyCode.Backquote;
    case "BracketLeft": return KeyCode.BracketLeft;
    case "Backslash": return KeyCode.Backslash;
    case "BracketRight": return KeyCode.BracketRight;
    case "Quote": return KeyCode.Quote;
  }

  const key = event.key ?? "";
  if (key.length === 1) {
    const upper = key.toUpperCase();
    return /[A-Z]/.test(upper)
      ? keyCodeFromLetter(upper)
      : keyCodeFromDigit(key);
  }

  switch (key) {
    case "Backspace": return KeyCode.Backspace;
    case "Tab": return KeyCode.Tab;
    case "Enter": return KeyCode.Enter;
    case "Escape": return KeyCode.Escape;
    case " ": return KeyCode.Space;
    case "ArrowLeft": return KeyCode.LeftArrow;
    case "ArrowUp": return KeyCode.UpArrow;
    case "ArrowRight": return KeyCode.RightArrow;
    case "ArrowDown": return KeyCode.DownArrow;
  }

  return KeyCode.Unknown;
}

function keyCodeFromLetter(letter: string): KeyCode {
  const upper = letter.toUpperCase();
  if (upper < "A" || upper > "Z") {
    return KeyCode.Unknown;
  }

  return (KeyCode.KeyA + upper.charCodeAt(0) - "A".charCodeAt(0)) as KeyCode;
}

function keyCodeFromDigit(digit: string): KeyCode {
  if (digit < "0" || digit > "9") {
    return KeyCode.Unknown;
  }

  return (KeyCode.Digit0 + Number(digit)) as KeyCode;
}

function keyCodeFromFunctionKey(code: string): KeyCode {
  const value = Number(code.slice(1));
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    return KeyCode.Unknown;
  }

  return (KeyCode.F1 + value - 1) as KeyCode;
}
