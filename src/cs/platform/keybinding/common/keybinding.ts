/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IKeyboardEventLike, SimpleKeybinding } from "src/cs/base/common/keybindings";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export interface IKeyboardDispatchEvent extends IKeyboardEventLike {
  readonly defaultPrevented?: boolean;
  readonly isComposing?: boolean;
  readonly target?: EventTarget | null;
  preventDefault?(): void;
  stopPropagation?(): void;
}

export const IKeybindingService = createDecorator<IKeybindingService>("keybindingService");

export interface IKeybindingService {
  readonly _serviceBrand: undefined;

  dispatchEvent(event: IKeyboardDispatchEvent): boolean;
  resolveKeyboardEvent(event: IKeyboardEventLike): SimpleKeybinding | null;
}

