/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";

export const FocusedViewContext = new RawContextKey<string>("focusedView", "");
export const HasWebFileSystemAccess = new RawContextKey<boolean>("hasWebFileSystemAccess", false);
export const SideBarVisibleContext = new RawContextKey<boolean>("sideBarVisible", false);
export const AuxiliaryBarVisibleContext = new RawContextKey<boolean>("auxiliaryBarVisible", false);

export const getVisibleViewContextKey = (viewId: string): string => `view.${viewId}.visible`;
