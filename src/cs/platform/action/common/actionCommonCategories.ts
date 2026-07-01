/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";

export const Categories = {
  View: localize("view", "View"),
  Help: localize("help", "Help"),
  Test: localize("test", "Test"),
  File: localize("file", "File"),
  Preferences: localize("preferences", "Preferences"),
  Developer: localize("developer", "Developer"),
} as const;
