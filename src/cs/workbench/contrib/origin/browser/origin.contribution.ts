import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { ExportSettingsView } from "src/cs/workbench/contrib/origin/browser/exportSettingsView";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);

if (container) {
  viewsRegistry.registerViews([{
    id: OriginExportSettingsViewId,
    name: localize("chart_curve_settings_title", "Curve Settings"),
    ctorDescriptor: new SyncDescriptor(ExportSettingsView),
    hideByDefault: true,
    order: 30,
  }], container);
}
