type DesktopBootstrapSettings = {
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

const bootstrapWorkbenchTheme = () => {
  const bootstrapWindow = window as DesktopBootstrapWindow;
  const initialTheme = bootstrapWindow.desktopBootstrap?.initialDeviceAnalysisSettings?.theme;
  const resolvedTheme = resolveTheme(initialTheme);
  const root = document.documentElement;

  root.classList.remove("light");
  root.classList.remove("dark");
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;
};

bootstrapWorkbenchTheme();
