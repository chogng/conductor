import type { Event } from "src/cs/base/common/event";
import type { ListRenderState } from "src/cs/base/browser/ui/list/list";

export interface ITableColumn<TRow, TCell = unknown> {
  readonly label: string;
  readonly tooltip?: string;
  readonly weight: number;
  readonly templateId: string;
  readonly minimumWidth?: number;
  readonly maximumWidth?: number;
  readonly onDidChangeWidthConstraints?: Event<void>;

  project(row: TRow): TCell;
}

export interface ITableVirtualDelegate<TRow> {
  readonly headerRowHeight: number;
  getHeight(row: TRow): number;
}

export interface ITableElementRenderDetails extends ListRenderState {}

export interface ITableRenderer<TCell, TTemplateData> {
  readonly templateId: string;
  renderTemplate(container: HTMLElement): TTemplateData;
  renderElement(
    cell: TCell,
    index: number,
    templateData: TTemplateData,
    details: ITableElementRenderDetails,
  ): void;
  disposeElement?(
    cell: TCell,
    index: number,
    templateData: TTemplateData,
    details: ITableElementRenderDetails,
  ): void;
  disposeTemplate(templateData: TTemplateData): void;
}

export type ITableSelectEvent<TRow> = {
  readonly browserEvent?: KeyboardEvent | MouseEvent;
  readonly index: number;
  readonly row: TRow;
};

export class TableError extends Error {
  constructor(user: string, message: string) {
    super(`TableError [${user}] ${message}`);
  }
}

