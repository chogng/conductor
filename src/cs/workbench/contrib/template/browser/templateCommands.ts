import { Disposable } from "src/cs/base/common/lifecycle";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import { getSession } from "src/cs/workbench/contrib/session/browser/useSession";
import type { TemplateMode } from "src/cs/workbench/contrib/session/browser/sessionContext";
import {
  TemplateCommandsContributionId,
  TemplateCommandIds,
} from "src/cs/workbench/contrib/template/common/template";

export const setTemplateMode = (mode: TemplateMode): void => {
  getSession().setTemplateMode(mode);
};

export const showTemplateManagement = (): void => {
  setTemplateMode("select");
};

export const showTemplateEditor = (): void => {
  setTemplateMode("save");
};

export class TemplateCommands extends Disposable implements IWorkbenchContribution {
  public static readonly ID = TemplateCommandsContributionId;
  public static readonly COMMANDS = TemplateCommandIds;
}

registerWorkbenchContribution2(TemplateCommands.ID, TemplateCommands, WorkbenchPhase.AfterRestored);
