import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { PreviewFile } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import { TableView } from "src/cs/workbench/contrib/table/browser/tableView";
import type { TableBindings } from "src/cs/workbench/services/table/common/table";

export type TableViewPaneProps = {
  readonly previewBindings: TableBindings;
  readonly previewFile?: PreviewFile | null;
  readonly previewStatus?: PreviewStatus;
  readonly selectedFileId?: string | null;
  readonly t: TranslateFn;
};

export class TableViewPane {
  public readonly element: HTMLElement;
  private readonly content = document.createElement("div");
  private readonly view: TableView;

  constructor(props: TableViewPaneProps) {
    this.view = new TableView(props);
    this.content.className = "table_view_pane_content";
    this.content.append(this.view.element);
    this.element = createPreviewPart({
      id: TableViewId,
      ariaLabel: props.t("da_preview_filename_label"),
      className: "table_view_pane",
      children: this.content,
    });
  }

  public update(props: TableViewPaneProps): void {
    this.view.update(props);
  }

  public dispose(): void {
    this.view.dispose();
    this.content.replaceChildren();
    this.element.remove();
  }
}

export default TableViewPane;
