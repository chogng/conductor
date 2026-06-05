import { getSession } from "src/cs/workbench/contrib/session/browser/session";
import type { TemplateMode } from "src/cs/workbench/contrib/session/browser/sessionContext";

export const setTemplateMode = (mode: TemplateMode): void => {
  getSession().setTemplateMode(mode);
};

export const showTemplateManagement = (): void => {
  setTemplateMode("select");
};

export const showTemplateEditor = (): void => {
  setTemplateMode("save");
};
