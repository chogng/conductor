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

export type Keybinding = readonly SimpleKeybinding[];

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
): Keybinding | null {
  if (!keybinding) {
    return null;
  }

  const firstChord = keybinding & 0x0000ffff;
  const secondChord = (keybinding & 0xffff0000) >>> 16;
  const firstKeybinding = decodeSimpleKeybinding(firstChord, platform);
  if (!firstKeybinding) {
    return null;
  }

  if (secondChord === 0) {
    return [firstKeybinding];
  }

  const secondKeybinding = decodeSimpleKeybinding(secondChord, platform);
  return secondKeybinding ? [firstKeybinding, secondKeybinding] : null;
}

export function decodeSimpleKeybinding(
  keybinding: number,
  platform: KeybindingPlatform = getCurrentKeybindingPlatform(),
): SimpleKeybinding | null {
  if (!keybinding) {
    return null;
  }

  const ctrlCmd = Boolean(keybinding & BinaryKeybindingsMask.CtrlCmd);
  const winCtrl = Boolean(keybinding & BinaryKeybindingsMask.WinCtrl);
  const keyCode = (keybinding & BinaryKeybindingsMask.KeyCode) as KeyCode;
  if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
    return null;
  }

  return {
    ctrlKey: platform === "mac" ? winCtrl : ctrlCmd,
    shiftKey: Boolean(keybinding & BinaryKeybindingsMask.Shift),
    altKey: Boolean(keybinding & BinaryKeybindingsMask.Alt),
    metaKey: platform === "mac" ? ctrlCmd : winCtrl,
    keyCode,
  };
}

export function simpleKeybindingEquals(
  first: SimpleKeybinding,
  second: SimpleKeybinding,
): boolean {
  return first.ctrlKey === second.ctrlKey &&
    first.shiftKey === second.shiftKey &&
    first.altKey === second.altKey &&
    first.metaKey === second.metaKey &&
    first.keyCode === second.keyCode;
}

export function keybindingEquals(
  first: Keybinding,
  second: Keybinding,
): boolean {
  return first.length === second.length &&
    first.every((keybinding, index) => simpleKeybindingEquals(keybinding, second[index]));
}

export function keybindingStartsWith(
  keybinding: Keybinding,
  prefix: Keybinding,
): boolean {
  return keybinding.length >= prefix.length &&
    prefix.every((prefixPart, index) => simpleKeybindingEquals(keybinding[index], prefixPart));
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

export function parseKeybinding(
  value: string,
  platform: KeybindingPlatform = getCurrentKeybindingPlatform(),
): Keybinding | null {
  const chords = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (chords.length === 0) {
    return null;
  }

  const result: SimpleKeybinding[] = [];
  for (const chord of chords) {
    const keybinding = parseSimpleKeybinding(chord, platform);
    if (!keybinding) {
      return null;
    }
    result.push(keybinding);
  }

  return result;
}

export function formatKeybinding(keybinding: Keybinding): string {
  return keybinding.map(formatSimpleKeybinding).join(" ");
}

export function formatSimpleKeybinding(keybinding: SimpleKeybinding): string {
  const parts: string[] = [];
  if (keybinding.ctrlKey) {
    parts.push("Ctrl");
  }
  if (keybinding.shiftKey) {
    parts.push("Shift");
  }
  if (keybinding.altKey) {
    parts.push("Alt");
  }
  if (keybinding.metaKey) {
    parts.push(getCurrentKeybindingPlatform() === "mac" ? "Cmd" : "Meta");
  }
  parts.push(formatKeyCode(keybinding.keyCode));
  return parts.join("+");
}

function parseSimpleKeybinding(
  value: string,
  platform: KeybindingPlatform,
): SimpleKeybinding | null {
  const parts = value
    .split("+")
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  let ctrlKey = false;
  let shiftKey = false;
  let altKey = false;
  let metaKey = false;
  let keyCode: KeyCode = KeyCode.Unknown;

  for (const part of parts) {
    const token = normalizeKeybindingToken(part);
    switch (token) {
      case "ctrl":
      case "control":
        ctrlKey = true;
        continue;
      case "shift":
        shiftKey = true;
        continue;
      case "alt":
      case "option":
      case "opt":
        altKey = true;
        continue;
      case "cmd":
      case "command":
      case "meta":
      case "win":
      case "windows":
      case "super":
        metaKey = true;
        continue;
      case "ctrlcmd":
      case "cmdctrl":
      case "cmdorctrl":
        if (platform === "mac") {
          metaKey = true;
        } else {
          ctrlKey = true;
        }
        continue;
      case "winctrl":
        if (platform === "mac") {
          ctrlKey = true;
        } else {
          metaKey = true;
        }
        continue;
    }

    if (keyCode !== KeyCode.Unknown) {
      return null;
    }

    keyCode = parseKeyCode(token);
  }

  if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
    return null;
  }

  return {
    ctrlKey,
    shiftKey,
    altKey,
    metaKey,
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

function normalizeKeybindingToken(value: string): string {
  return value.toLowerCase().replace(/[-_]/g, "");
}

function parseKeyCode(token: string): KeyCode {
  if (token.length === 1) {
    const upper = token.toUpperCase();
    if (upper >= "A" && upper <= "Z") {
      return keyCodeFromLetter(upper);
    }

    if (token >= "0" && token <= "9") {
      return keyCodeFromDigit(token);
    }
  }

  if (/^f\d{1,2}$/.test(token)) {
    return keyCodeFromFunctionKey(token.toUpperCase());
  }

  switch (token) {
    case "backspace": return KeyCode.Backspace;
    case "tab": return KeyCode.Tab;
    case "enter":
    case "return": return KeyCode.Enter;
    case "escape":
    case "esc": return KeyCode.Escape;
    case "space": return KeyCode.Space;
    case "pageup": return KeyCode.PageUp;
    case "pagedown": return KeyCode.PageDown;
    case "end": return KeyCode.End;
    case "home": return KeyCode.Home;
    case "left":
    case "arrowleft": return KeyCode.LeftArrow;
    case "up":
    case "arrowup": return KeyCode.UpArrow;
    case "right":
    case "arrowright": return KeyCode.RightArrow;
    case "down":
    case "arrowdown": return KeyCode.DownArrow;
    case "insert":
    case "ins": return KeyCode.Insert;
    case "delete":
    case "del": return KeyCode.Delete;
    case "semicolon":
    case ";": return KeyCode.Semicolon;
    case "equal":
    case "=": return KeyCode.Equal;
    case "comma":
    case ",": return KeyCode.Comma;
    case "minus":
    case "-": return KeyCode.Minus;
    case "period":
    case ".": return KeyCode.Period;
    case "slash":
    case "/": return KeyCode.Slash;
    case "backquote":
    case "`": return KeyCode.Backquote;
    case "bracketleft":
    case "[": return KeyCode.BracketLeft;
    case "backslash":
    case "\\": return KeyCode.Backslash;
    case "bracketright":
    case "]": return KeyCode.BracketRight;
    case "quote":
    case "'": return KeyCode.Quote;
  }

  return KeyCode.Unknown;
}

function formatKeyCode(keyCode: KeyCode): string {
  if (keyCode >= KeyCode.KeyA && keyCode <= KeyCode.KeyZ) {
    return String.fromCharCode("A".charCodeAt(0) + keyCode - KeyCode.KeyA);
  }

  if (keyCode >= KeyCode.Digit0 && keyCode <= KeyCode.Digit9) {
    return String(keyCode - KeyCode.Digit0);
  }

  if (keyCode >= KeyCode.F1 && keyCode <= KeyCode.F12) {
    return `F${keyCode - KeyCode.F1 + 1}`;
  }

  switch (keyCode) {
    case KeyCode.Backspace: return "Backspace";
    case KeyCode.Tab: return "Tab";
    case KeyCode.Enter: return "Enter";
    case KeyCode.Escape: return "Escape";
    case KeyCode.Space: return "Space";
    case KeyCode.PageUp: return "PageUp";
    case KeyCode.PageDown: return "PageDown";
    case KeyCode.End: return "End";
    case KeyCode.Home: return "Home";
    case KeyCode.LeftArrow: return "Left";
    case KeyCode.UpArrow: return "Up";
    case KeyCode.RightArrow: return "Right";
    case KeyCode.DownArrow: return "Down";
    case KeyCode.Insert: return "Insert";
    case KeyCode.Delete: return "Delete";
    case KeyCode.Semicolon: return "Semicolon";
    case KeyCode.Equal: return "Equal";
    case KeyCode.Comma: return "Comma";
    case KeyCode.Minus: return "Minus";
    case KeyCode.Period: return "Period";
    case KeyCode.Slash: return "Slash";
    case KeyCode.Backquote: return "Backquote";
    case KeyCode.BracketLeft: return "BracketLeft";
    case KeyCode.Backslash: return "Backslash";
    case KeyCode.BracketRight: return "BracketRight";
    case KeyCode.Quote: return "Quote";
    default: return "Unknown";
  }
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
