import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
} from "src/cs/workbench/common/contributions";
import { SashSettingsController } from "src/cs/workbench/contrib/sash/browser/sash";

registerWorkbenchContribution2(
  SashSettingsController.ID,
  SashSettingsController,
  WorkbenchPhase.AfterRestored,
);
