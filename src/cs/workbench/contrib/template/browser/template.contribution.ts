import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import { TemplateAuxiliaryBarViewPane } from "src/cs/workbench/contrib/template/browser/templateAuxiliaryBarViewPane";
import { TemplateAuxiliaryBarViewId, TemplateContributionId } from "src/cs/workbench/contrib/template/common/template";

import "src/cs/workbench/contrib/template/browser/templateCommands";
import "src/cs/workbench/contrib/template/browser/templateApplyService";
import "src/cs/workbench/contrib/template/browser/templateService";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(WorkbenchViewContainers.auxiliarybar);

if (container) {
  viewsRegistry.registerViews([{
    id: TemplateAuxiliaryBarViewId,
    name: localize("template_management_title", "Template Management"),
    ctorDescriptor: new SyncDescriptor(TemplateAuxiliaryBarViewPane, [document.createElement("div")]),
    hideByDefault: true,
    order: 0,
  }], container);
}

export class TemplateContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(TemplateContributionId, TemplateContribution, WorkbenchPhase.AfterRestored);
