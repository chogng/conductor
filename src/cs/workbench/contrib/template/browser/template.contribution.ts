/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { createAuxiliaryBarActionViewItem } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import { ViewPaneContainer } from "src/cs/workbench/browser/parts/views/viewPaneContainer";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  ViewContainerLocation,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { registerTemplateCommands } from "src/cs/workbench/contrib/template/browser/templateCommands";
import {
  TemplateViewContainerId,
  TemplateViewId,
} from "src/cs/workbench/contrib/template/common/template";
import { TemplateViewPane } from "src/cs/workbench/contrib/template/browser/templateViewlet";

registerTemplateCommands();

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.registerViewContainer({
  id: TemplateViewContainerId,
  title: localize("template.management.title", "Template Management"),
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [{
    actionViewItemProvider: createAuxiliaryBarActionViewItem,
    className: "workbench-part-view-pane-container",
    id: TemplateViewContainerId,
    renderHeader: true,
    title: localize("template.management.title", "Template Management"),
  }]),
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });

viewsRegistry.registerViews([{
  id: TemplateViewId,
  name: localize("template.management.title", "Template Management"),
  ctorDescriptor: new SyncDescriptor(TemplateViewPane),
  hideByDefault: false,
  order: 0,
}], container);
