/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import { IDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import { IUriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentity";
import {
  BaseExplorerViewPane,
  type ExplorerViewPaneSurfaceOptions,
} from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import { ThumbnailViewId } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { IAppearanceService } from "src/cs/workbench/services/appearance/common/appearance";
import {
  IDecorationsService,
  type IDecorationsService as IDecorationsServiceType,
} from "src/cs/workbench/services/decorations/common/decorations";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import {
  IReviewService,
  type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
} from "src/cs/workbench/services/settings/common/settings";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import { ITableService } from "src/cs/workbench/services/table/common/table";
import {
  IThumbnailPreviewService,
  IThumbnailService,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

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
    @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
    @INotificationService notificationService: INotificationService,
    @ITableService tableService: ITableService,
    @ISliceService sliceService: ISliceService,
    @IThumbnailPreviewService thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService thumbnailService: IThumbnailService,
    @IUserTemplateService userTemplateService: IUserTemplateServiceType,
    @IDecorationsService decorationsService: IDecorationsServiceType,
    @IReviewService reviewService: IReviewServiceType,
    @ISettingsService settingsService: ISettingsServiceType,
    @IUriIdentityService uriIdentityService: IUriIdentityService,
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
      layoutService,
      notificationService,
      tableService,
      sliceService,
      thumbnailPreviewService,
      thumbnailService,
      userTemplateService,
      decorationsService,
      reviewService,
      settingsService,
      uriIdentityService,
    );
  }
}
