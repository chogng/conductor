import { useMemo, useState, type ReactNode } from 'react';
import { UiPrefsContext, type UiPrefsContextValue } from './ui-prefs-context';

type UiPrefsProviderProps = {
  children: ReactNode;
};

export const UiPrefsProvider = ({ children }: UiPrefsProviderProps) => {
  const [lastSelectedColor, setLastSelectedColor] = useState('default');

  const value = useMemo<UiPrefsContextValue>(
    () => ({
      lastSelectedColor,
      setLastSelectedColor,
    }),
    [lastSelectedColor],
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
};

