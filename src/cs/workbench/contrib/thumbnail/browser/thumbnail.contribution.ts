/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { Registry } from "src/cs/platform/registry/common/platform";
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import {
  Extensions as ViewExtensions,
  type IViewContainersRegistry,
  type IViewsRegistry,
} from "src/cs/workbench/common/views";
import {
  ThumbnailViewContainerId,
  ThumbnailViewId,
} from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { ThumbnailViewPane } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailViewPane";
import { ThumbnailContributionId } from "src/cs/workbench/services/thumbnail/common/thumbnail";

import "src/cs/workbench/contrib/thumbnail/browser/thumbnailActions";
import "src/cs/workbench/contrib/thumbnail/browser/media/thumbnail.css";

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
const container = viewContainersRegistry.get(ThumbnailViewContainerId);

if (container) {
  viewsRegistry.registerViews([{
    id: ThumbnailViewId,
    name: localize("files.thumbnailView", "Thumbnail"),
    ctorDescriptor: new SyncDescriptor(ThumbnailViewPane),
    hideByDefault: false,
    order: 1,
  }], container);
}

export class ThumbnailContribution extends Disposable implements IWorkbenchContribution {}

registerWorkbenchContribution2(ThumbnailContributionId, ThumbnailContribution, WorkbenchPhase.AfterRestored);
