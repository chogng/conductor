/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import workbenchLogoUrl from "../../../../../../resources/brand/conductor-line.svg";

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
const SPLASH_LOGO_CLASS = "conductor-workbench-splash-logo";
const SPLASH_LOGO_SILVER_FILTER = "brightness(0) saturate(100%) invert(78%) sepia(8%) saturate(336%) hue-rotate(179deg) brightness(95%) contrast(89%)";

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
  overflow: hidden;
  background:
    radial-gradient(76% 64% at 50% 50%, rgba(255, 255, 255, 0.76) 0%, rgba(255, 255, 255, 0.42) 40%, rgba(255, 255, 255, 0) 70%),
    linear-gradient(152deg, rgba(237, 243, 251, 0.86) 0%, rgba(248, 248, 244, 0.84) 48%, rgba(255, 240, 231, 0.86) 100%);
  color: #6f6f72;
  user-select: none;
}

#${SPLASH_ELEMENT_ID}::before {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(246, 246, 242, 0.34);
  -webkit-backdrop-filter: blur(28px) saturate(150%);
  backdrop-filter: blur(28px) saturate(150%);
}

#${SPLASH_ELEMENT_ID}::after {
  content: "";
  position: absolute;
  width: min(360px, 52vw);
  aspect-ratio: 1;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.56) 0%, rgba(255, 255, 255, 0) 68%);
}

#${SPLASH_ELEMENT_ID} .${SPLASH_LOGO_CLASS} {
  position: relative;
  z-index: 1;
  display: block;
  width: 72px;
  height: 72px;
  object-fit: contain;
  opacity: 0.72;
  filter: ${SPLASH_LOGO_SILVER_FILTER} drop-shadow(0 18px 32px rgba(44, 48, 56, 0.16));
}

html.dark #${SPLASH_ELEMENT_ID},
#${SPLASH_ELEMENT_ID}[data-theme="dark"] {
  background:
    radial-gradient(74% 62% at 50% 50%, rgba(81, 86, 99, 0.42) 0%, rgba(31, 33, 39, 0.48) 44%, rgba(9, 10, 12, 0) 72%),
    linear-gradient(152deg, rgba(17, 24, 32, 0.9) 0%, rgba(23, 24, 28, 0.88) 48%, rgba(33, 25, 23, 0.9) 100%);
  color: #c7c7c9;
}

html.dark #${SPLASH_ELEMENT_ID}::before,
#${SPLASH_ELEMENT_ID}[data-theme="dark"]::before {
  background: rgba(10, 11, 13, 0.36);
}

html.dark #${SPLASH_ELEMENT_ID}::after,
#${SPLASH_ELEMENT_ID}[data-theme="dark"]::after {
  background: radial-gradient(circle, rgba(122, 130, 149, 0.28) 0%, rgba(20, 22, 26, 0) 70%);
}

html.dark #${SPLASH_ELEMENT_ID} .${SPLASH_LOGO_CLASS},
#${SPLASH_ELEMENT_ID}[data-theme="dark"] .${SPLASH_LOGO_CLASS} {
  opacity: 0.84;
  filter: ${SPLASH_LOGO_SILVER_FILTER} drop-shadow(0 18px 34px rgba(0, 0, 0, 0.34));
}

html.light #${SPLASH_ELEMENT_ID},
#${SPLASH_ELEMENT_ID}[data-theme="light"] {
  background:
    radial-gradient(120% 92% at 58% 54%, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.46) 42%, rgba(255, 255, 255, 0) 72%),
    linear-gradient(152deg, #edf3fb 0%, #f8f8f4 45%, #fff0e7 100%);
  color: #6f6f72;
}

html.light #${SPLASH_ELEMENT_ID} .${SPLASH_LOGO_CLASS},
#${SPLASH_ELEMENT_ID}[data-theme="light"] .${SPLASH_LOGO_CLASS} {
  opacity: 0.72;
  filter: ${SPLASH_LOGO_SILVER_FILTER} drop-shadow(0 18px 32px rgba(44, 48, 56, 0.16));
}
`;
  document.head.appendChild(style);
};

const createSplashLogo = () => {
  const logo = document.createElement("img");
  logo.className = SPLASH_LOGO_CLASS;
  logo.src = workbenchLogoUrl;
  logo.alt = "";
  return logo;
};

const createSplashContent = (theme: "light" | "dark") => {
  const splash = document.createElement("div");
  splash.id = SPLASH_ELEMENT_ID;
  splash.setAttribute("aria-hidden", "true");
  splash.dataset.theme = theme;

  splash.appendChild(createSplashLogo());
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
