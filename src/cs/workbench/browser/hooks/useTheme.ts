import { workbenchThemeService } from "src/cs/workbench/services/themes/browser/themeService";

export const getThemeState = () => workbenchThemeService.getSnapshot();

export const onDidChangeThemeState = workbenchThemeService.subscribe;

export const useTheme = getThemeState;
