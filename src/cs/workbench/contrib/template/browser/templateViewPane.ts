import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ITemplateService } from "src/cs/workbench/contrib/template/common/template";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  TemplateView,
  type TemplateViewOptions,
} from "src/cs/workbench/contrib/template/browser/views/templateView";
import { TemplateViewId } from "src/cs/workbench/contrib/template/common/template";

import "src/cs/workbench/contrib/template/browser/media/templateViewPane.css";

const TEMPLATE_TITLE = localize("template_workspace_title", "Template");

export type TemplateViewPaneProps = {
  readonly conductorSettings?: TemplateViewOptions["conductorSettings"];
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly onTemplateApplied?: TemplateViewOptions["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateViewOptions["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateViewOptions["onUpdateSettings"];
  readonly sessionService: ISessionService;
  readonly sourceFiles?: SessionFile[];
  readonly tableModel?: TemplateViewOptions["tableModel"];
  readonly templateImportController: TemplateImportController;
  readonly templateService: ITemplateService;
};

export class TemplateViewPane extends ViewPane {
  public get configElement(): HTMLElement {
    return this.templateView.configElement;
  }

  private readonly previewPart: HTMLElement;
  private readonly templateView: TemplateView;

  constructor(props: TemplateViewPaneProps) {
    super({
      id: TemplateViewId,
      title: TEMPLATE_TITLE,
      className: "template-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.templateView = new TemplateView({
      ...props,
      sourceFiles: props.sourceFiles ?? [],
    });

    this.previewPart = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: TEMPLATE_TITLE,
      className: "template_pane template_pane--main template_pane--joined_auxiliarybar",
      children: this.templateView.element,
    });
    this.body.append(this.previewPart);
  }

  public update(props: TemplateViewPaneProps): void {
    this.templateView.update({
      ...props,
      sourceFiles: props.sourceFiles ?? [],
    });
  }

  public dispose(): void {
    this.templateView.dispose();
    this.previewPart.remove();
    super.dispose();
  }
}

export default TemplateViewPane;
