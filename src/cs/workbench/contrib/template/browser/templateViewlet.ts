/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  IContextMenuService,
  type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { replaceChildrenIfChanged } from "src/cs/base/browser/dom";
import { ITableService } from "src/cs/workbench/services/table/common/table";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import { createSessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { TemplateViewId } from "src/cs/workbench/contrib/template/common/template";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import {
  TemplateView,
  type TemplateViewOptions,
} from "src/cs/workbench/contrib/template/browser/views/templateView";
import {
  ITemplateViewStateService,
  type ITemplateViewStateService as ITemplateViewStateServiceType,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";

import "src/cs/workbench/contrib/template/browser/media/templateViewPane.css";

const TEMPLATE_TITLE = localize("template.management.title", "Template Management");
const TEMPLATE_EDITOR_TITLE = localize("template.editor.title", "Template Editor");

export class TemplateViewPane extends ViewPane {
  private readonly content = document.createElement("div");
  private readonly templateView: TemplateView;

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuServiceType,
    @INotificationService private readonly notificationService: INotificationService,
    @ISessionService private readonly sessionService: ISessionService,
    @ITableService private readonly tableService: ITableService,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
    @ITemplateViewStateService private readonly templateViewStateService: ITemplateViewStateServiceType,
  ) {
    super({
      id: TemplateViewId,
      title: TEMPLATE_TITLE,
      className: "auxiliarybar_view_pane template_auxiliarybar_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.body.setAttribute("aria-label", TEMPLATE_TITLE);
    this.content.className = "template_pane template_pane--auxiliary";
    this.templateView = new TemplateView(this.createViewOptions());
    this.content.append(this.templateView.configElement);
    this.body.append(this.content);
    this._register(this.sessionService.onDidChangeSession(() => {
      this.update();
    }));
    this._register(this.templateViewStateService.onDidChangeTemplateState(() => {
      this.updateTitle();
      this.update();
    }));
    this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
      this.update();
    }));
    this.updateTitle();
  }

  public update(): void {
    this.templateView.update(this.createViewOptions());
    replaceChildrenIfChanged(this.content, this.templateView.configElement);
  }

  public dispose(): void {
    this.templateView.dispose();
    this.content.replaceChildren();
    this.content.remove();
    super.dispose();
  }

  private updateTitle(): void {
    this.body.setAttribute("aria-label", this.getTitle());
  }

  private getTitle(): string {
    return this.templateViewStateService.getState().mode === "editor"
      ? TEMPLATE_EDITOR_TITLE
      : TEMPLATE_TITLE;
  }

  private createViewOptions(): TemplateViewOptions {
    return {
      commandService: this.commandService,
      contextMenuService: this.contextMenuService,
      notificationService: this.notificationService,
      rawFiles: createSessionReadModel(this.sessionService.getSnapshot()).rawFiles,
      tableService: this.tableService,
      templateViewStateService: this.templateViewStateService,
      userTemplateService: this.userTemplateService,
    };
  }
}
