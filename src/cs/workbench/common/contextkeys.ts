import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";

export type WorkbenchMainPart = "table" | "chart";

export const FocusedViewContext = new RawContextKey<string>("focusedView", "");
export const HasWebFileSystemAccess = new RawContextKey<boolean>("hasWebFileSystemAccess", false);
export const ActiveWorkbenchViewContext = new RawContextKey<string>("activeWorkbenchView", "");
export const ActiveWorkbenchMainPartContext = new RawContextKey<WorkbenchMainPart | "">("activeWorkbenchMainPart", "");
export const ActiveAuxiliaryBarViewContext = new RawContextKey<string>("activeAuxiliaryBarView", "");

export const getVisibleViewContextKey = (viewId: string): string => `view.${viewId}.visible`;
