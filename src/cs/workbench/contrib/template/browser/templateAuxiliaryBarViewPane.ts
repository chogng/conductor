/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  IContextMenuService,
  type IContextMenuService as IContextMenuServiceType,
} from "src/cs/platform/contextview/browser/contextView";
import {
  IFileDialogService,
  type IFileDialogService as IFileDialogServiceType,
} from "src/cs/platform/dialogs/common/dialogs";
import {
  IFileService,
  type IFileService as IFileServiceType,
} from "src/cs/platform/files/common/files";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  ITemplateService,
  TemplateAuxiliaryBarViewId,
  type ITemplateService as ITemplateServiceType,
  type TemplateViewInput,
} from "src/cs/workbench/services/template/common/template";
import { IPathService, type IPathService as IPathServiceType } from "src/cs/workbench/services/path/common/pathService";
import { TemplateImportController } from "src/cs/workbench/services/template/browser/templateImportController";
import {
  TemplateView,
  type TemplateViewOptions,
} from "src/cs/workbench/contrib/template/browser/views/templateView";

import "src/cs/workbench/contrib/template/browser/media/templateViewPane.css";

const TEMPLATE_TITLE = localize("template.management.title", "Template Management");
const TEMPLATE_EDITOR_TITLE = localize("template.editor.title", "Template Editor");

export class TemplateAuxiliaryBarViewPane extends ViewPane {
  private readonly content = document.createElement("div");
  private readonly templateImportController: TemplateImportController;
  private readonly templateView: TemplateView;

  constructor(
    @IContextMenuService private readonly contextMenuService: IContextMenuServiceType,
    @IFileDialogService dialogsService: IFileDialogServiceType,
    @IFileService filesService: IFileServiceType,
    @IPathService pathService: IPathServiceType,
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
    this.templateImportController = new TemplateImportController(
      dialogsService,
      filesService,
      pathService,
    );
    this.templateView = new TemplateView(this.createViewOptions(this.templateService.getViewInput()));
    this.content.append(this.templateView.configElement);
    this.body.append(this.content);
    this._register(this.templateService.onDidChangeTemplateViewInput(input => {
      this.update(input);
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
    return this.templateService.getState().mode === "save"
      ? TEMPLATE_EDITOR_TITLE
      : TEMPLATE_TITLE;
  }

  private createViewOptions(input: TemplateViewInput | null): TemplateViewOptions {
    return {
      ...input,
      contextMenuService: this.contextMenuService,
      rawFiles: input?.rawFiles ?? [],
      templateImportController: this.templateImportController,
      templateService: this.templateService,
    };
  }
}
