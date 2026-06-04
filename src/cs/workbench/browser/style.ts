import { SIDEBAR_DEFAULT_WIDTH_PX } from "src/cs/workbench/browser/layout";

import "src/cs/workbench/browser/media/style.css";
import "src/cs/workbench/browser/media/part.css";
import "src/cs/workbench/browser/parts/previewArea/media/previewpart.css";
import "src/cs/workbench/browser/parts/auxiliarybar/media/auxiliaryBarPart.css";
import "src/cs/workbench/browser/parts/sidebar/media/sidebarpart.css";
import "src/cs/workbench/browser/parts/titlebar/media/titlebar.css";

export type WorkbenchStyle = Record<string, string | number | null | undefined>;

const toCssPropertyName = (key: string): string =>
  key.startsWith("--")
    ? key
    : key.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`);

export const getWorkbenchStyle = (style?: WorkbenchStyle): WorkbenchStyle =>
  ({
    "--sidebar-width": `${SIDEBAR_DEFAULT_WIDTH_PX}px`,
    "--template-stack-panel-h": "clamp(384px, 52dvh, 640px)",
    ...(style ?? {}),
  });

export const applyWorkbenchStyle = (
  element: HTMLElement,
  style?: WorkbenchStyle,
): void => {
  const resolvedStyle = getWorkbenchStyle(style);

  for (const [key, value] of Object.entries(resolvedStyle)) {
    if (value === null || value === undefined) {
      continue;
    }

    element.style.setProperty(toCssPropertyName(key), String(value));
  }
};
