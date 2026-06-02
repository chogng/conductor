import { SessionModel } from "src/cs/workbench/contrib/session/browser/sessionModel";
import type { SessionContextValue } from "./sessionContext";

export const defaultSessionModel = new SessionModel();

export const getSession = (): SessionContextValue =>
  defaultSessionModel.createContextValue(defaultSessionModel.getSnapshot());

export const useSession = getSession;
