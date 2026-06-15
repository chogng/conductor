import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
} from "src/cs/workbench/common/contributions";
import { BaseLocalizationWorkbenchContribution } from "src/cs/workbench/contrib/localization/common/localization.contribution";

export const LocalizationContributionId = "workbench.contrib.localization";

class LocalizationContribution extends BaseLocalizationWorkbenchContribution {}

registerWorkbenchContribution2(
	LocalizationContributionId,
	LocalizationContribution,
	WorkbenchPhase.BlockStartup,
);
