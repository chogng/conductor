import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { OnboardingContributionId } from "src/cs/workbench/contrib/onboarding/common/onboarding";

export class OnboardingContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(OnboardingContributionId, OnboardingContribution, WorkbenchPhase.AfterRestored);
