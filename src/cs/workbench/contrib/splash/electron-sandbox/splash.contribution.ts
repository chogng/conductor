import {
  bootstrapWorkbenchTheme,
  hideWorkbenchSplash,
  showWorkbenchSplash,
} from "../browser/partsSplash";

export const installSplashContribution = () => {
  const resolvedTheme = bootstrapWorkbenchTheme();
  showWorkbenchSplash(resolvedTheme);
  return resolvedTheme;
};

export const removeSplashContribution = () => {
  hideWorkbenchSplash();
};
