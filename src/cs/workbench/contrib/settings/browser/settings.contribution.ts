import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerSettingsActions } from "src/cs/workbench/contrib/settings/browser/settingsActions";
import {
  ISettingsControllerService,
  type ISettingsControllerService as ISettingsControllerServiceType,
} from "src/cs/workbench/contrib/settings/browser/settingsControllerService";
import { SettingsContributionId, SettingsNavigationViewId, SettingsViewId } from "src/cs/workbench/services/settings/common/settings";

class SettingsViewPane extends ViewPane {
  constructor(
    @ISettingsControllerService settingsControllerService: ISettingsControllerServiceType,
  ) {
    super({
      id: SettingsViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this._register(settingsControllerService.attachContent(this.body));
  }
}

class SettingsNavigationViewPane extends ViewPane {
  constructor(
    @ISettingsControllerService settingsControllerService: ISettingsControllerServiceType,
  ) {
    super({
      id: SettingsNavigationViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-navigation-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this._register(settingsControllerService.attachNavigation(this.body));
  }
}

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const sidebarContainer = viewContainersRegistry.get(WorkbenchViewContainers.files);
const settingsContainer = viewContainersRegistry.get(WorkbenchViewContainers.settings);

if (sidebarContainer) {
  viewsRegistry.registerViews([{
    id: SettingsNavigationViewId,
    name: localize("settings.title", "Settings"),
    ctorDescriptor: new SyncDescriptor(SettingsNavigationViewPane),
    hideByDefault: false,
    order: 10,
  }], sidebarContainer);
}

if (settingsContainer) {
  viewsRegistry.registerViews([{
    id: SettingsViewId,
    name: localize("settings.title", "Settings"),
    ctorDescriptor: new SyncDescriptor(SettingsViewPane),
    hideByDefault: false,
    order: 0,
  }], settingsContainer);
}

export class SettingsContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    this._register(registerSettingsActions());
  }
}

registerWorkbenchContribution2(SettingsContributionId, SettingsContribution, WorkbenchPhase.BlockStartup);
