/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  IContextMenuService,
  type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { ITableService } from "src/cs/workbench/services/table/common/table";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import {
  ITemplateService,
  TemplateAuxiliaryBarViewId,
  type ITemplateService as ITemplateServiceType,
  type TemplateViewInput,
} from "src/cs/workbench/services/template/common/template";
import {
  TemplateView,
  type TemplateViewOptions,
} from "src/cs/workbench/contrib/template/browser/views/templateView";

import "src/cs/workbench/contrib/template/browser/media/templateViewPane.css";

const TEMPLATE_TITLE = localize("template.management.title", "Template Management");
const TEMPLATE_EDITOR_TITLE = localize("template.editor.title", "Template Editor");

export class TemplateAuxiliaryBarViewPane extends ViewPane {
  private readonly content = document.createElement("div");
  private readonly templateView: TemplateView;

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuServiceType,
    @INotificationService private readonly notificationService: INotificationService,
    @ITableService private readonly tableService: ITableService,
    @ITemplateService private readonly templateService: ITemplateServiceType,
  ) {
    super({
      id: TemplateAuxiliaryBarViewId,
      title: TEMPLATE_TITLE,
      className: "auxiliarybar_view_pane template_auxiliarybar_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.body.setAttribute("aria-label", TEMPLATE_TITLE);
    this.content.className = "template_pane template_pane--auxiliary";
    this.templateView = new TemplateView(this.createViewOptions(this.templateService.getViewInput()));
    this.content.append(this.templateView.configElement);
    this.body.append(this.content);
    this._register(this.templateService.onDidChangeTemplateViewInput(() => {
      this.update(this.templateService.getViewInput());
    }));
    this._register(this.templateService.onDidChangeTemplateState(() => {
      this.updateTitle();
      this.update(this.templateService.getViewInput());
    }));
    this.updateTitle();
  }

  public update(input: TemplateViewInput | null): void {
    this.templateView.update(this.createViewOptions(input));
    if (this.templateView.configElement.parentElement !== this.content) {
      this.content.replaceChildren(this.templateView.configElement);
    }
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
    return this.templateService.getState().mode === "editor"
      ? TEMPLATE_EDITOR_TITLE
      : TEMPLATE_TITLE;
  }

  private createViewOptions(input: TemplateViewInput | null): TemplateViewOptions {
    return {
      ...input,
      commandService: this.commandService,
      contextMenuService: this.contextMenuService,
      notificationService: this.notificationService,
      rawFiles: input?.rawFiles ?? [],
      tableService: this.tableService,
      templateService: this.templateService,
    };
  }
}
