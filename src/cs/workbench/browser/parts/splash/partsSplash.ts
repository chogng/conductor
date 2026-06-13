/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import workbenchLogoUrl from "../../../../../../resources/brand/conductor.svg";

export type DesktopBootstrapSettings = {
  initialWorkbenchSettings?: {
    theme?: unknown;
    [key: string]: unknown;
  } | null;
};

type DesktopBootstrapWindow = Window & {
  conductor?: {
    context?: {
      configuration?: () => DesktopBootstrapSettings | undefined;
    };
  };
};

const resolveTheme = (theme: unknown) => {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return theme === "light" || theme === "dark" ? theme : "light";
};

export const bootstrapWorkbenchTheme = () => {
  const bootstrapWindow = window as DesktopBootstrapWindow;
  const initialTheme = bootstrapWindow.conductor?.context?.configuration?.()?.initialWorkbenchSettings?.theme;
  const resolvedTheme = resolveTheme(initialTheme);
  const root = document.documentElement;

  root.classList.remove("light");
  root.classList.remove("dark");
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
};

const SPLASH_ELEMENT_ID = "conductor-workbench-splash";
const SPLASH_STYLE_ELEMENT_ID = "conductor-workbench-splash-style";

const ensureSplashStyles = () => {
  if (document.getElementById(SPLASH_STYLE_ELEMENT_ID)) return;

  const style = document.createElement("style");
  style.id = SPLASH_STYLE_ELEMENT_ID;
  style.textContent = `
#${SPLASH_ELEMENT_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(120% 92% at 58% 54%, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.46) 42%, rgba(255, 255, 255, 0) 72%),
    linear-gradient(152deg, #edf3fb 0%, #f8f8f4 45%, #fff0e7 100%);
  color: #6f6f72;
  user-select: none;
}

#${SPLASH_ELEMENT_ID} img {
  width: 54px;
  height: 54px;
  object-fit: contain;
  opacity: 0.72;
}

html.dark #${SPLASH_ELEMENT_ID},
#${SPLASH_ELEMENT_ID}[data-theme="dark"] {
  background:
    radial-gradient(115% 88% at 58% 54%, rgba(79, 84, 96, 0.46) 0%, rgba(27, 29, 34, 0.38) 42%, rgba(9, 10, 12, 0) 72%),
    linear-gradient(152deg, #111820 0%, #17181c 48%, #211917 100%);
  color: #c7c7c9;
}

html.dark #${SPLASH_ELEMENT_ID} img,
#${SPLASH_ELEMENT_ID}[data-theme="dark"] img {
  filter: invert(1);
  opacity: 0.74;
}

html.light #${SPLASH_ELEMENT_ID},
#${SPLASH_ELEMENT_ID}[data-theme="light"] {
  background:
    radial-gradient(120% 92% at 58% 54%, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.46) 42%, rgba(255, 255, 255, 0) 72%),
    linear-gradient(152deg, #edf3fb 0%, #f8f8f4 45%, #fff0e7 100%);
  color: #6f6f72;
}

html.light #${SPLASH_ELEMENT_ID} img,
#${SPLASH_ELEMENT_ID}[data-theme="light"] img {
  filter: none;
  opacity: 0.72;
}
`;
  document.head.appendChild(style);
};

const createSplashContent = (theme: "light" | "dark") => {
  const splash = document.createElement("div");
  splash.id = SPLASH_ELEMENT_ID;
  splash.setAttribute("aria-hidden", "true");
  splash.dataset.theme = theme;

  const logo = document.createElement("img");
  logo.src = workbenchLogoUrl;
  logo.alt = "";

  splash.appendChild(logo);
  return splash;
};

export const showWorkbenchSplash = (theme?: "light" | "dark") => {
  if (typeof document === "undefined") return;
  if (document.getElementById(SPLASH_ELEMENT_ID)) return;
  ensureSplashStyles();

  const splashTheme =
    theme === "light" || theme === "dark"
      ? theme
      : document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";

  const splash = createSplashContent(splashTheme);
  (document.body ?? document.documentElement).appendChild(splash);
};

export const hideWorkbenchSplash = () => {
  if (typeof document === "undefined") return;
  document.getElementById(SPLASH_ELEMENT_ID)?.remove();
};
