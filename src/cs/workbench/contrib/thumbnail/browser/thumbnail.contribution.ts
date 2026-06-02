import { Disposable } from "src/cs/base/common/lifecycle";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { ThumbnailContributionId } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";

import "src/cs/workbench/contrib/thumbnail/browser/media/thumbnail.css";

export class ThumbnailContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ThumbnailContributionId, ThumbnailContribution, WorkbenchPhase.AfterRestored);
