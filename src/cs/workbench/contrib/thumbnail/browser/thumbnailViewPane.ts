/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import { IDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import { IProgressService } from "src/cs/platform/progress/common/progress";
import { IUriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentity";
import { IWorkspaceContextService } from "src/cs/platform/workspace/common/workspace";
import {
  BaseExplorerViewPane,
  type ExplorerViewPaneSurfaceOptions,
} from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import { ThumbnailViewId } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { IAppearanceService } from "src/cs/workbench/services/appearance/common/appearance";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import {
  IReviewService,
  type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import {
  IPlotService,
  type IPlotService as IPlotServiceType,
} from "src/cs/workbench/services/plot/common/plot";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
} from "src/cs/workbench/services/settings/common/settings";
import {
  IThumbnailPreviewService,
  IThumbnailService,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";

const ThumbnailViewPaneSurface: ExplorerViewPaneSurfaceOptions = {
  className: "files-view-pane files-thumbnail-view-pane",
  id: ThumbnailViewId,
  title: localize("files.thumbnailView", "Thumbnail"),
  viewLayout: "thumbnail",
};

export class ThumbnailViewPane extends BaseExplorerViewPane {
  constructor(
    @ICommandService commandService: ICommandService,
    @IContextMenuService contextMenuService: IContextMenuService,
    @IDialogService dialogService: IDialogService,
    @IExplorerService explorerService: IExplorerService,
    @IFileService filesService: IFileService,
    @IInstantiationService instantiationService: IInstantiationService,
    @IAppearanceService appearanceService: IAppearanceService,
    @IViewsService viewsService: IViewsService,
    @INotificationService notificationService: INotificationService,
    @IProgressService progressService: IProgressService,
    @IPlotService plotService: IPlotServiceType,
    @ISettingsService settingsService: ISettingsServiceType,
    @ISliceService sliceService: ISliceService,
    @IThumbnailPreviewService thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService thumbnailService: IThumbnailService,
    @IUserTemplateService userTemplateService: IUserTemplateServiceType,
    @IReviewService reviewService: IReviewServiceType,
    @IUriIdentityService uriIdentityService: IUriIdentityService,
    @IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
  ) {
    super(
      ThumbnailViewPaneSurface,
      commandService,
      contextMenuService,
      dialogService,
      explorerService,
      filesService,
      instantiationService,
      appearanceService,
      viewsService,
      notificationService,
      progressService,
      plotService,
      settingsService,
      sliceService,
      thumbnailPreviewService,
      thumbnailService,
      userTemplateService,
      reviewService,
      uriIdentityService,
      workspaceContextService,
    );
  }
}
