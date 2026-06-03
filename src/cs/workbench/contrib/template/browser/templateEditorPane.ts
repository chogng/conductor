import { localize } from "src/cs/nls";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { ITemplateService } from "src/cs/workbench/contrib/template/common/template";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import {
  TemplateManagerView,
  type TemplateElementOptions,
} from "src/cs/workbench/contrib/template/browser/templateView";

import "src/cs/workbench/contrib/template/browser/media/templateView.css";

export type TemplateEditorPaneProps = {
  readonly analysisSettings?: TemplateElementOptions["analysisSettings"];
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly content?: Node | null;
  readonly importSessionElement?: HTMLElement | null;
  readonly onTemplateApplied?: TemplateElementOptions["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateElementOptions["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateElementOptions["onUpdateSettings"];
  readonly sourceFiles?: SessionFile[];
  readonly tableModel?: TemplateElementOptions["tableModel"];
  readonly templateImportController: TemplateImportController;
  readonly templateService: ITemplateService;
};

export class TemplateEditorPane {
  public readonly element: HTMLElement;
  public readonly sidebarElement: HTMLElement;
  private readonly previewContent: HTMLElement;
  private readonly sidebarPart: SidebarPart;
  private readonly templateView: TemplateManagerView;

  constructor(props: TemplateEditorPaneProps) {
    this.templateView = new TemplateManagerView(toTemplateProps(props));
    this.previewContent = document.createElement("div");
    this.previewContent.className = "template_view_pane_content";
    this.previewContent.append(this.templateView.element);

    this.element = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: localize("data_extraction_template", "Data Extraction Template"),
      className: "template_view_pane template_view_pane--joined_sidebar",
      children: this.previewContent,
    });

    this.sidebarPart = new SidebarPart({
      ariaLabel: localize("data_extraction_template", "Data Extraction Template"),
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: localize("data_extraction_template", "Data Extraction Template"),
    });
    this.sidebarElement = this.sidebarPart.element;
  }

  public update(props: TemplateEditorPaneProps): void {
    this.templateView.update(toTemplateProps(props));
    this.sidebarPart.update({
      ariaLabel: localize("data_extraction_template", "Data Extraction Template"),
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: localize("data_extraction_template", "Data Extraction Template"),
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
}: TemplateEditorPaneProps): TemplateElementOptions => ({
  ...props,
  sourceFiles,
  importSessionElement: _importSessionElement ?? null,
});

export default TemplateEditorPane;
