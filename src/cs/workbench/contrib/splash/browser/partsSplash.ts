import workbenchLogoUrl from "src/cs/workbench/contrib/splash/browser/logo.svg";

export type DesktopBootstrapSettings = {
  initialDeviceAnalysisSettings?: {
    theme?: unknown;
    [key: string]: unknown;
  } | null;
};

type DesktopBootstrapWindow = Window & {
  desktopBootstrap?: DesktopBootstrapSettings;
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
  const initialTheme = bootstrapWindow.desktopBootstrap?.initialDeviceAnalysisSettings?.theme;
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: #f5f4ef;
  color: #222222;
  font-family: var(--font-family-base, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 21px;
  font-weight: 650;
  line-height: 1.1;
  user-select: none;
}

#${SPLASH_ELEMENT_ID} img {
  width: 58px;
  height: 58px;
  object-fit: contain;
}

html.dark #${SPLASH_ELEMENT_ID},
#${SPLASH_ELEMENT_ID}[data-theme="dark"] {
  background: #0b0b0c;
  color: #f5f4ef;
}

html.light #${SPLASH_ELEMENT_ID},
#${SPLASH_ELEMENT_ID}[data-theme="light"] {
  background: #f5f4ef;
  color: #222222;
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

  const brand = document.createElement("div");
  brand.textContent = "Conductor Studio";

  splash.appendChild(logo);
  splash.appendChild(brand);
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
