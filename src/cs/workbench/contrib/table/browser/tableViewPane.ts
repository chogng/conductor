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
  private readonly header = document.createElement("div");
  private readonly title = document.createElement("span");
  private readonly meta = document.createElement("div");
  private readonly dimensions = document.createElement("span");
  private readonly status = document.createElement("span");
  private readonly view: TableView;

  constructor(props: TableViewPaneProps) {
    this.view = new TableView(props);
    this.header.className = "table_view_header";
    this.title.className = "table_view_title";
    this.meta.className = "table_view_meta";
    this.dimensions.className = "table_view_dimensions";
    this.status.className = "table_view_status";
    this.content.className = "table_view_pane_content";
    this.content.append(this.header, this.view.element);
    this.element = createPreviewPart({
      id: TableViewId,
      ariaLabel: props.t("preview_filename_label"),
      className: "table_view_pane",
      children: this.content,
    });
    this.update(props);
  }

  public update(props: TableViewPaneProps): void {
    this.view.update(props);
    const { dimensions, status, title } = getHeaderState(props);
    this.title.textContent = title;
    this.meta.replaceChildren();
    if (dimensions) {
      this.dimensions.textContent = dimensions;
      this.meta.append(this.dimensions);
    }
    if (status) {
      this.status.textContent = status;
      delete this.status.dataset.tone;
      this.meta.append(this.status);
    }
    this.header.replaceChildren(this.title, this.meta);
  }

  public dispose(): void {
    this.view.dispose();
    this.content.replaceChildren();
    this.element.remove();
  }
}

const getHeaderState = ({
  previewFile,
  previewStatus,
  t,
}: TableViewPaneProps): {
  readonly dimensions?: string;
  readonly status?: string;
  readonly title: string;
} => {
  const fileName = previewFile?.fileName
    ? String(previewFile.fileName).replace(/\.csv$/i, "")
    : "";
  const title = fileName
    ? `${t("preview_filename_label")}: ${fileName}`
    : previewStatus?.state === "loading"
      ? t("preview_loading")
      : t("preview_empty_title");

  const dimensions = previewFile
    ? {
        value: `${Math.max(0, Number(previewFile.rowCount) || 0)} × ${Math.max(0, Number(previewFile.columnCount) || 0)}`,
      }
    : null;

  if (previewStatus?.state === "loading") {
    return {
      title,
      dimensions: dimensions?.value,
      status: previewStatus.message || t("preview_loading_hint"),
    };
  }

  return {
    title,
    dimensions: dimensions?.value,
  };
};

export default TableViewPane;
