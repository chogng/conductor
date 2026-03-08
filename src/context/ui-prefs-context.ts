import { createContext, type Dispatch, type SetStateAction } from 'react';

export type UiPrefsContextValue = {
  lastSelectedColor: string;
  setLastSelectedColor: Dispatch<SetStateAction<string>>;
};

export const UiPrefsContext = createContext<UiPrefsContextValue | null>(null);

