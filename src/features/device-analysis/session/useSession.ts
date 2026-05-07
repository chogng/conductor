import { useContext } from "react";
import { SessionContext } from "./device-analysis-session-context";
import type { SessionContextValue } from "./device-analysis-session-context";

export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error(
      "useSession must be used within SessionProvider.",
    );
  }

  return context;
};

