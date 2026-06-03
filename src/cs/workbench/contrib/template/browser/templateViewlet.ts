import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { ITemplateService } from "src/cs/workbench/contrib/template/common/template";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import {
  TemplateView,
  type TemplateViewOptions,
} from "src/cs/workbench/contrib/template/browser/views/templateView";
import { TemplateSidebarViewId, TemplateViewId } from "src/cs/workbench/contrib/template/common/template";

import "src/cs/workbench/contrib/template/browser/media/templateViewlet.css";

const TEMPLATE_TITLE = localize("template_editor_title", "Template");

export type TemplateViewletProps = {
  readonly analysisSettings?: TemplateViewOptions["analysisSettings"];
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly content?: Node | null;
  readonly importSessionElement?: HTMLElement | null;
  readonly onTemplateApplied?: TemplateViewOptions["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateViewOptions["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateViewOptions["onUpdateSettings"];
  readonly sourceFiles?: SessionFile[];
  readonly tableModel?: TemplateViewOptions["tableModel"];
  readonly templateImportController: TemplateImportController;
  readonly templateService: ITemplateService;
};

export class TemplateViewlet extends ViewPane {
  public readonly sidebarView: TemplateSidebarViewPane;
  private readonly previewPart: HTMLElement;
  private readonly previewContent: HTMLElement;
  private readonly templateView: TemplateView;

  constructor(props: TemplateViewletProps) {
    super({
      id: TemplateViewId,
      title: TEMPLATE_TITLE,
      className: "template-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.templateView = new TemplateView(toTemplateProps(props));
    this.previewContent = document.createElement("div");
    this.previewContent.className = "template_viewlet_content";
    this.previewContent.append(this.templateView.element);

    this.previewPart = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: TEMPLATE_TITLE,
      className: "template_viewlet template_viewlet--joined_sidebar",
      children: this.previewContent,
    });
    this.body.append(this.previewPart);

    this.sidebarView = new TemplateSidebarViewPane(this.templateView.sidebarElement);
  }

  public get sidebarElement(): HTMLElement {
    return this.sidebarView.element;
  }

  public update(props: TemplateViewletProps): void {
    this.templateView.update(toTemplateProps(props));
    this.sidebarView.update(this.templateView.sidebarElement);
  }

  public dispose(): void {
    this.sidebarView.dispose();
    this.templateView.dispose();
    this.previewContent.replaceChildren();
    this.previewPart.remove();
    super.dispose();
  }
}

export class TemplateSidebarViewPane extends ViewPane {
  private readonly sidebarPart: SidebarPart;

  constructor(content: HTMLElement) {
    super({
      id: TemplateSidebarViewId,
      title: TEMPLATE_TITLE,
      className: "template-sidebar-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.sidebarPart = new SidebarPart({
      ariaLabel: TEMPLATE_TITLE,
      children: content,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: TEMPLATE_TITLE,
    });
    this.body.append(this.sidebarPart.element);
  }

  public update(content: HTMLElement): void {
    this.sidebarPart.update({
      ariaLabel: TEMPLATE_TITLE,
      children: content,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: TEMPLATE_TITLE,
    });
  }

  public dispose(): void {
    this.sidebarPart.dispose();
    super.dispose();
  }
}

const toTemplateProps = ({
  importSessionElement: _importSessionElement,
  sourceFiles = [],
  ...props
}: TemplateViewletProps): TemplateViewOptions => ({
  ...props,
  sourceFiles,
  importSessionElement: _importSessionElement ?? null,
});

export default TemplateViewlet;
