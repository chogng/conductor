import { useMemo, useState } from "react";
import { UiPrefsContext } from "./ui-prefs-context";

export const UiPrefsProvider = ({ children }) => {
  const [lastSelectedColor, setLastSelectedColor] = useState("default");

  const value = useMemo(
    () => ({
      lastSelectedColor,
      setLastSelectedColor,
    }),
    [lastSelectedColor],
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
};

