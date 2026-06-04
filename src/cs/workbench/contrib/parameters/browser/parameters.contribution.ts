import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { ParametersView } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.secondary);

if (container) {
  viewsRegistry.registerViews([{
    id: ParametersViewId,
    name: localize("da_analysis_views_parameters", "Parameters"),
    ctorDescriptor: new SyncDescriptor(ParametersView),
    hideByDefault: true,
    order: 20,
  }], container);
}
