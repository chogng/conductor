import { useSyncExternalStore } from 'react';
import { workbenchThemeService } from 'src/cs/workbench/services/themes/browser/themeService';

export const useTheme = () =>
  useSyncExternalStore(
    workbenchThemeService.subscribe,
    workbenchThemeService.getSnapshot,
    workbenchThemeService.getSnapshot,
  );
