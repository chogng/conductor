/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isModifierKey, KeyCode } from "src/cs/base/common/keyCodes";
import type { Keybinding, SimpleKeybinding } from "src/cs/base/common/keybindings";

export class KeybindingParser {
	public static parseKeybinding(value: string): Keybinding | null {
		const chords = value
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (chords.length === 0) {
			return null;
		}

		const result: SimpleKeybinding[] = [];
		for (const chord of chords) {
			const keybinding = this.parseSimpleKeybinding(chord);
			if (!keybinding) {
				return null;
			}
			result.push(keybinding);
		}

		return result;
	}

	private static parseSimpleKeybinding(value: string): SimpleKeybinding | null {
		const parsed = this.readModifiers(value);
		if (!parsed) {
			return null;
		}

		const keyCode = parseKeyCode(parsed.key);
		if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
			return null;
		}

		return {
			ctrlKey: parsed.ctrlKey,
			shiftKey: parsed.shiftKey,
			altKey: parsed.altKey,
			metaKey: parsed.metaKey,
			keyCode,
		};
	}

	private static readModifiers(value: string): {
		readonly altKey: boolean;
		readonly ctrlKey: boolean;
		readonly key: string;
		readonly metaKey: boolean;
		readonly shiftKey: boolean;
	} | null {
		let input = value.toLowerCase().trim();
		let ctrlKey = false;
		let shiftKey = false;
		let altKey = false;
		let metaKey = false;

		let matchedModifier = false;
		do {
			matchedModifier = false;
			const modifier = input.match(/^([a-z]+)(\+|-)/);
			if (!modifier) {
				break;
			}

			switch (normalizeKeybindingToken(modifier[1])) {
				case "ctrl":
					ctrlKey = true;
					break;
				case "shift":
					shiftKey = true;
					break;
				case "alt":
					altKey = true;
					break;
				case "cmd":
				case "meta":
				case "win":
					metaKey = true;
					break;
				default:
					return null;
			}

			input = input.slice(modifier[0].length);
			matchedModifier = true;
		} while (matchedModifier);

		if (!input) {
			return null;
		}

		return {
			ctrlKey,
			shiftKey,
			altKey,
			metaKey,
			key: normalizeKeybindingToken(input),
		};
	}
}

function normalizeKeybindingToken(value: string): string {
	return value === "-"
		? value
		: value.toLowerCase().replace(/[-_]/g, "");
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
		case "contextmenu": return KeyCode.ContextMenu;
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
