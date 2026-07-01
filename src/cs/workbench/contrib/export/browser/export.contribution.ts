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
import { registerExportCommands } from "src/cs/workbench/contrib/export/browser/exportCommands";
import { ExportViewPane } from "src/cs/workbench/contrib/export/browser/exportViewPane";
import {
  ExportContributionId,
  ExportViewId,
} from "src/cs/workbench/services/export/common/export";

export class ExportContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    registerExportView();
    this._register(registerExportCommands());
  }
}

let exportViewRegistered = false;

function registerExportView(): void {
  if (exportViewRegistered) {
    return;
  }

  const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
  const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
  const container = viewContainersRegistry.get(WorkbenchViewContainers.export);
  if (!container) {
    return;
  }

  exportViewRegistered = true;
  viewsRegistry.registerViews([{
    id: ExportViewId,
    name: localize("chart.views.export", "Export"),
    ctorDescriptor: new SyncDescriptor(ExportViewPane),
    hideByDefault: true,
    order: 10,
    when: ContextKeyExpr.and(
      ActiveWorkbenchMainPartContext.isEqualTo("chart"),
      ActiveAuxiliaryBarViewContext.isEqualTo("export"),
    ),
  }], container);
}

registerWorkbenchContribution2(ExportContributionId, ExportContribution, WorkbenchPhase.BlockStartup);
