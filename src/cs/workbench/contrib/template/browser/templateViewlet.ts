import { localize } from "src/cs/nls";
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

export class TemplateViewlet {
  public readonly element: HTMLElement;
  public readonly sidebarElement: HTMLElement;
  private readonly previewContent: HTMLElement;
  private readonly sidebarPart: SidebarPart;
  private readonly templateView: TemplateView;

  constructor(props: TemplateViewletProps) {
    this.templateView = new TemplateView(toTemplateProps(props));
    this.previewContent = document.createElement("div");
    this.previewContent.className = "template_viewlet_content";
    this.previewContent.append(this.templateView.element);

    this.element = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: TEMPLATE_TITLE,
      className: "template_viewlet template_viewlet--joined_sidebar",
      children: this.previewContent,
    });

    this.sidebarPart = new SidebarPart({
      ariaLabel: TEMPLATE_TITLE,
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: TEMPLATE_TITLE,
    });
    this.sidebarElement = this.sidebarPart.element;
  }

  public update(props: TemplateViewletProps): void {
    this.templateView.update(toTemplateProps(props));
    this.sidebarPart.update({
      ariaLabel: TEMPLATE_TITLE,
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: TEMPLATE_TITLE,
    });
  }

  public dispose(): void {
    this.sidebarPart.dispose();
    this.templateView.dispose();
    this.previewContent.replaceChildren();
    this.element.remove();
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
