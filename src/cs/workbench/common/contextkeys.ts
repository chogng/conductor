import { RawContextKey } from "src/cs/platform/contextkey/common/contextkey";

export const FocusedViewContext = new RawContextKey<string>("focusedView", "");

export const getVisibleViewContextKey = (viewId: string): string => `view.${viewId}.visible`;
