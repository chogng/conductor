import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ContextKeyExpr } from "src/cs/platform/contextkey/common/contextkey";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
} from "src/cs/workbench/common/contextkeys";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { ExportViewPane } from "src/cs/workbench/contrib/export/browser/exportViewPane";
import { ExportViewId } from "src/cs/workbench/services/export/common/export";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);

if (container) {
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
