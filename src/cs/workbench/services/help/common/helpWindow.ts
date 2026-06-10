/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";

export const HelpWindowKinds = ["changelog", "guide"] as const;

export type HelpWindowKind = (typeof HelpWindowKinds)[number];

export type OpenHelpWindowRequest = {
  readonly kind: HelpWindowKind;
};

export const isHelpWindowKind = (value: unknown): value is HelpWindowKind =>
  value === "changelog" || value === "guide";

export const normalizeHelpWindowKind = (value: unknown): HelpWindowKind =>
  isHelpWindowKind(value) ? value : "changelog";

export const HelpWindowOpenChannel = workbenchIpcChannels.helpWindowOpen;
