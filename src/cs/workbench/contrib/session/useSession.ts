import { SessionModel } from "src/cs/workbench/contrib/session/sessionModel";
import type { SessionContextValue } from "./analysis-session-context";

export const defaultSessionModel = new SessionModel();

export const getSession = (): SessionContextValue =>
  defaultSessionModel.createContextValue(defaultSessionModel.getSnapshot());

export const useSession = getSession;
