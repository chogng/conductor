import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { ExportViewPane } from "src/cs/workbench/contrib/export/browser/exportViewPane";
import { ExportViewId } from "src/cs/workbench/contrib/export/common/export";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);

if (container) {
  viewsRegistry.registerViews([{
    id: ExportViewId,
    name: localize("analysis_views_export", "Export"),
    ctorDescriptor: new SyncDescriptor(ExportViewPane),
    hideByDefault: true,
    order: 10,
  }], container);
}
