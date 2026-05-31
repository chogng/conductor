import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { SettingsContributionId } from "src/cs/workbench/contrib/settings/common/settings";
import "src/cs/workbench/contrib/settings/browser/settingsService";

export class SettingsContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(SettingsContributionId, SettingsContribution, WorkbenchPhase.AfterRestored);
