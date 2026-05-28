import type { CSSProperties } from "react";
import { SIDEBAR_DEFAULT_WIDTH_PX } from "src/cs/workbench/browser/layout";

export const shouldShowDesktopCommandBarByDefault =
  typeof window !== "undefined" &&
  window.desktopMeta?.isDesktop === true &&
  window.desktopMeta?.platform === "win32";

export const getWorkspaceShellStyle = (
  style?: CSSProperties,
): CSSProperties =>
  ({
    "--sidebar-width": `${SIDEBAR_DEFAULT_WIDTH_PX}px`,
    "--da-template-stack-panel-h": "clamp(24rem, 52dvh, 40rem)",
    ...(style ?? {}),
  }) as CSSProperties;
