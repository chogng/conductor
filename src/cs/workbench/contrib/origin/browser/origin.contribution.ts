import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
} from "src/cs/workbench/browser/contextkeys";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerOriginCommands } from "src/cs/workbench/contrib/origin/browser/originCommands";
import { OriginSettingsViewPane } from "src/cs/workbench/contrib/origin/browser/originSettingsViewPane";
import {
  OriginContributionId,
  OriginExportSettingsViewId,
} from "src/cs/workbench/services/origin/common/origin";

export class OriginContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerOriginView();
    this._register(registerOriginCommands());
  }
}

let originViewRegistered = false;

function registerOriginView(): void {
  if (originViewRegistered) {
    return;
  }

  const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
  const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);
  if (!container) {
    return;
  }

  originViewRegistered = true;
  viewsRegistry.registerViews([{
    id: OriginExportSettingsViewId,
    name: localize("origin.curveSettings.title", "Origin Settings"),
    ctorDescriptor: new SyncDescriptor(OriginSettingsViewPane),
    hideByDefault: true,
    order: 30,
    when: ContextKeyExpr.and(
      ActiveWorkbenchMainPartContext.isEqualTo("chart"),
      ActiveAuxiliaryBarViewContext.isEqualTo("settings"),
    ),
  }], container);
}

registerWorkbenchContribution2(OriginContributionId, OriginContribution, WorkbenchPhase.BlockStartup);
