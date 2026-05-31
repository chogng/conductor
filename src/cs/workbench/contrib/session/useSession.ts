import { useContext } from "react";
import { SessionContext } from "./analysis-session-context";
import type { SessionContextValue } from "./analysis-session-context";

export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error(
      "useSession must be used within a session context.",
    );
  }

  return context;
};
