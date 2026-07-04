/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { createSidebarActionViewItem } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  SettingsNavigationViewContainerId,
  SettingsNavigationViewId,
  SettingsViewContainerId,
  SettingsViewId,
} from "src/cs/workbench/contrib/settings/common/settings";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerSettingsActions } from "src/cs/workbench/contrib/settings/browser/settingsActions";
import {
  ISettingsControllerService,
  type ISettingsControllerService as ISettingsControllerServiceType,
} from "src/cs/workbench/contrib/settings/browser/settingsControllerService";

const SETTINGS_CONTRIBUTION_ID = "workbench.contrib.settings";

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
const sidebarContainer = viewContainersRegistry.registerViewContainer({
  id: SettingsNavigationViewContainerId,
  title: localize("workbench.views.settings", "Settings"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createSidebarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: SettingsNavigationViewContainerId,
    renderHeader: true,
    title: localize("workbench.views.settings", "Settings"),
  }]),
}, ViewContainerLocation.Sidebar, { isDefault: true, doNotRegisterOpenCommand: true });
const settingsContainer = viewContainersRegistry.registerViewContainer({
  id: SettingsViewContainerId,
  title: localize("workbench.views.settings", "Settings"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    className: "workbench-part-view-pane-container",
    id: SettingsViewContainerId,
    renderHeader: false,
    title: localize("workbench.views.settings", "Settings"),
  }]),
}, ViewContainerLocation.Panel, { isDefault: true, doNotRegisterOpenCommand: true });

viewsRegistry.registerViews([{
  id: SettingsNavigationViewId,
  name: localize("settings.title", "Settings"),
  ctorDescriptor: new SyncDescriptor(SettingsNavigationViewPane),
  hideByDefault: false,
  order: 10,
}], sidebarContainer);

viewsRegistry.registerViews([{
  id: SettingsViewId,
  name: localize("settings.title", "Settings"),
  ctorDescriptor: new SyncDescriptor(SettingsViewPane),
  hideByDefault: false,
  order: 0,
}], settingsContainer);

export class SettingsContribution extends Disposable implements IWorkbenchContribution {
  public constructor() {
    super();

    this._register(registerSettingsActions());
  }
}

registerWorkbenchContribution2(SETTINGS_CONTRIBUTION_ID, SettingsContribution, WorkbenchPhase.BlockStartup);
