import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";

export const FocusedViewContext = new RawContextKey<string>("focusedView", "");
export const HasWebFileSystemAccess = new RawContextKey<boolean>("hasWebFileSystemAccess", false);
export const ActiveWorkbenchViewContext = new RawContextKey<string>("activeWorkbenchView", "");
export const ActiveWorkbenchMainPartContext = new RawContextKey<string>("activeWorkbenchMainPart", "");
export const ActiveAuxiliaryBarViewContext = new RawContextKey<string>("activeAuxiliaryBarView", "");

export const getVisibleViewContextKey = (viewId: string): string => `view.${viewId}.visible`;
