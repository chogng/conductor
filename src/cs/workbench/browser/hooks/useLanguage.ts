import { useSyncExternalStore } from 'react';
import { languageService } from 'src/cs/platform/language/browser/languageService';

export const useLanguage = () =>
  useSyncExternalStore(
    languageService.subscribe,
    languageService.getSnapshot,
    languageService.getSnapshot,
  );
