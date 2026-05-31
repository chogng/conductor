import {
  bootstrapWorkbenchTheme,
  hideWorkbenchSplash,
  showWorkbenchSplash,
} from "../browser/partsSplash";
import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";

export const SplashContributionId = "workbench.contrib.splash";

export const installSplashContribution = () => {
  const resolvedTheme = bootstrapWorkbenchTheme();
  showWorkbenchSplash(resolvedTheme);
  return resolvedTheme;
};

export const removeSplashContribution = () => {
  hideWorkbenchSplash();
};

export class SplashContribution extends Disposable implements IWorkbenchContribution {
  constructor() {
    super();

    installSplashContribution();
  }

  public override dispose(): void {
    removeSplashContribution();
    super.dispose();
  }
}

registerWorkbenchContribution2(SplashContributionId, SplashContribution, WorkbenchPhase.BlockStartup);
