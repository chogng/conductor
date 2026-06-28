/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const KeyCode = {
  Unknown: 0,
  Backspace: 1,
  Tab: 2,
  Enter: 3,
  Shift: 4,
  Ctrl: 5,
  Alt: 6,
  Escape: 9,
  Space: 10,
  PageUp: 11,
  PageDown: 12,
  End: 13,
  Home: 14,
  LeftArrow: 15,
  UpArrow: 16,
  RightArrow: 17,
  DownArrow: 18,
  Insert: 19,
  Delete: 20,
  Digit0: 21,
  Digit1: 22,
  Digit2: 23,
  Digit3: 24,
  Digit4: 25,
  Digit5: 26,
  Digit6: 27,
  Digit7: 28,
  Digit8: 29,
  Digit9: 30,
  Numpad0: 71,
  Numpad1: 72,
  Numpad2: 73,
  Numpad3: 74,
  Numpad4: 75,
  Numpad5: 76,
  Numpad6: 77,
  Numpad7: 78,
  Numpad8: 79,
  Numpad9: 80,
  KeyA: 31,
  KeyB: 32,
  KeyC: 33,
  KeyD: 34,
  KeyE: 35,
  KeyF: 36,
  KeyG: 37,
  KeyH: 38,
  KeyI: 39,
  KeyJ: 40,
  KeyK: 41,
  KeyL: 42,
  KeyM: 43,
  KeyN: 44,
  KeyO: 45,
  KeyP: 46,
  KeyQ: 47,
  KeyR: 48,
  KeyS: 49,
  KeyT: 50,
  KeyU: 51,
  KeyV: 52,
  KeyW: 53,
  KeyX: 54,
  KeyY: 55,
  KeyZ: 56,
  Meta: 57,
  F1: 59,
  F2: 60,
  F3: 61,
  F4: 62,
  F5: 63,
  F6: 64,
  F7: 65,
  F8: 66,
  F9: 67,
  F10: 68,
  F11: 69,
  F12: 70,
  ContextMenu: 84,
  Semicolon: 85,
  Equal: 86,
  Comma: 87,
  Minus: 88,
  Period: 89,
  Slash: 90,
  Backquote: 91,
  BracketLeft: 92,
  Backslash: 93,
  BracketRight: 94,
  Quote: 95,
} as const;

export type KeyCode = typeof KeyCode[keyof typeof KeyCode];

export const KeyMod = {
  CtrlCmd: (1 << 11) >>> 0,
  Shift: (1 << 10) >>> 0,
  Alt: (1 << 9) >>> 0,
  WinCtrl: (1 << 8) >>> 0,
} as const;

export type KeyMod = typeof KeyMod[keyof typeof KeyMod];

export function KeyChord(firstPart: number, secondPart: number): number {
  const chordPart = ((secondPart & 0x0000ffff) << 16) >>> 0;
  return (firstPart | chordPart) >>> 0;
}

export function isModifierKey(keyCode: KeyCode): boolean {
  return keyCode === KeyCode.Ctrl ||
    keyCode === KeyCode.Shift ||
    keyCode === KeyCode.Alt ||
    keyCode === KeyCode.Meta;
}
