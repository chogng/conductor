import { keyCodeFromKeyboardEvent } from "src/cs/base/common/keybindings";
import { isModifierKey, KeyCode } from "src/cs/base/common/keyCodes";

export interface IKeyboardEvent {
  readonly browserEvent: KeyboardEvent;
  readonly target: HTMLElement;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly altGraphKey: boolean;
  readonly keyCode: KeyCode;
  readonly code: string;
  preventDefault(): void;
  stopPropagation(): void;
}

export function hasModifierKeys(event: {
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}): boolean {
  return event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;
}

export class StandardKeyboardEvent implements IKeyboardEvent {
  public readonly browserEvent: KeyboardEvent;
  public readonly target: HTMLElement;
  public readonly ctrlKey: boolean;
  public readonly shiftKey: boolean;
  public readonly altKey: boolean;
  public readonly metaKey: boolean;
  public readonly altGraphKey: boolean;
  public readonly keyCode: KeyCode;
  public readonly code: string;

  public constructor(source: KeyboardEvent) {
    this.browserEvent = source;
    this.target = source.target as HTMLElement;
    this.keyCode = keyCodeFromKeyboardEvent(source);
    this.code = source.code;
    this.ctrlKey = source.ctrlKey || this.keyCode === KeyCode.Ctrl;
    this.shiftKey = source.shiftKey || this.keyCode === KeyCode.Shift;
    this.altKey = source.altKey || this.keyCode === KeyCode.Alt;
    this.metaKey = source.metaKey || this.keyCode === KeyCode.Meta;
    this.altGraphKey = source.getModifierState?.("AltGraph") ?? false;
  }

  public preventDefault(): void {
    this.browserEvent.preventDefault();
  }

  public stopPropagation(): void {
    this.browserEvent.stopPropagation();
  }

  public isModifierKey(): boolean {
    return isModifierKey(this.keyCode);
  }
}
