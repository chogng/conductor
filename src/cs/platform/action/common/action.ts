/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 * 要支持 keybinding 字段：补 platform/keybinding/common/keybindingsRegistry.ts。
 * 要支持上游隐藏/重置菜单状态：再补 actions.contribution.ts 和 menuResetAction.ts。
 *--------------------------------------------------------------------------------------------*/

import type { ContextKeyExpression } from "src/cs/platform/contextkey/common/contextkey";
import type { ICommandMetadata } from "src/cs/platform/commands/common/commands";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";

export interface ILocalizedString {
  readonly value: string;
  readonly original: string;
}

export function isLocalizedString(value: unknown): value is ILocalizedString {
  return !!value
    && typeof value === "object"
    && typeof (value as ILocalizedString).original === "string"
    && typeof (value as ILocalizedString).value === "string";
}

export type ICommandActionTitle = string | ILocalizedString;
export type Icon = LxIconDefinition;

export interface ICommandAction {
  readonly id: string;
  readonly title: ICommandActionTitle;
  readonly shortTitle?: ICommandActionTitle;
  readonly category?: ICommandActionTitle;
  readonly tooltip?: ICommandActionTitle;
  readonly icon?: Icon;
  readonly precondition?: ContextKeyExpression;
  readonly toggled?: ContextKeyExpression | {
    readonly condition: ContextKeyExpression;
    readonly title?: ICommandActionTitle;
    readonly tooltip?: ICommandActionTitle;
    readonly icon?: Icon;
  };
  readonly metadata?: ICommandMetadata;
}
