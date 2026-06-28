/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { asPromise, type CancelablePromise, createCancelablePromise } from "src/cs/base/common/async";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { IPagedModel } from "src/cs/base/common/paging";
import type {
	ITableBodyCellDescriptor,
	ITableColumnHeaderDescriptor,
	ITablePagedWidgetRenderer,
	ITableRowHeaderDescriptor,
	ITableWidgetRenderer,
} from "src/cs/base/browser/ui/table/table";

type PagedTableBodyCellTemplateData<TRow, TTemplateData> = {
	request: CancelablePromise<TRow> | null;
	renderVersion: number;
	readonly templateData: TTemplateData;
};

export class PagedTableWidgetRenderer<TRow, TBodyTemplateData = unknown, TColumnHeaderTemplateData = unknown>
	implements ITableWidgetRenderer<PagedTableBodyCellTemplateData<TRow, TBodyTemplateData>, TColumnHeaderTemplateData>, IDisposable {
	private readonly pendingRequests = new Set<CancelablePromise<TRow>>();

	public constructor(
		private model: IPagedModel<TRow>,
		private readonly renderer: ITablePagedWidgetRenderer<TRow, TBodyTemplateData, TColumnHeaderTemplateData>,
	) {}

	public setModel(model: IPagedModel<TRow>): void {
		if (this.model === model) {
			return;
		}

		this.cancelPendingRequests();
		this.model = model;
	}

	public renderBodyCellTemplate(cell: HTMLTableCellElement, content: HTMLElement): PagedTableBodyCellTemplateData<TRow, TBodyTemplateData> {
		return {
			request: null,
			renderVersion: 0,
			templateData: this.renderer.renderBodyCellTemplate(cell, content),
		};
	}

	public clearBodyCell(templateData: PagedTableBodyCellTemplateData<TRow, TBodyTemplateData>): void {
		this.cancelStateRequest(templateData);
		this.renderer.clearBodyCell(templateData.templateData);
	}

	public disposeBodyCellTemplate(templateData: PagedTableBodyCellTemplateData<TRow, TBodyTemplateData>): void {
		this.cancelStateRequest(templateData);
		this.renderer.disposeBodyCellTemplate(templateData.templateData);
	}

	public renderBodyCell(templateData: PagedTableBodyCellTemplateData<TRow, TBodyTemplateData>, descriptor: ITableBodyCellDescriptor): void {
		this.renderer.renderBodyCell?.(templateData.templateData, descriptor);
	}

	public renderBodyCellContent(templateData: PagedTableBodyCellTemplateData<TRow, TBodyTemplateData>, descriptor: ITableBodyCellDescriptor): void {
		this.cancelStateRequest(templateData);
		templateData.renderVersion += 1;
		const renderVersion = templateData.renderVersion;
		const rowIndex = descriptor.rowIndex;

		if (this.model.isResolved(rowIndex)) {
			this.renderer.renderBodyCellContent(templateData.templateData, {
				...descriptor,
				row: this.model.get(rowIndex),
			});
			return;
		}

		this.renderer.renderBodyCellPlaceholder(templateData.templateData, descriptor);
		const request = createCancelablePromise(token => asPromise(() => this.model.resolve(rowIndex, token)));
		templateData.request = request;
		this.pendingRequests.add(request);

		request.then(row => {
			if (
				templateData.request !== request ||
				templateData.renderVersion !== renderVersion
			) {
				return;
			}

			templateData.request = null;
			this.pendingRequests.delete(request);
			this.renderer.renderBodyCellContent(templateData.templateData, {
				...descriptor,
				row,
			});
		}, () => {
			if (templateData.request === request) {
				templateData.request = null;
			}
			this.pendingRequests.delete(request);
		});
	}

	public renderColumnHeaderTemplate(cell: HTMLElement): TColumnHeaderTemplateData {
		return this.renderer.renderColumnHeaderTemplate(cell);
	}

	public disposeColumnHeaderTemplate(templateData: TColumnHeaderTemplateData): void {
		this.renderer.disposeColumnHeaderTemplate?.(templateData);
	}

	public renderColumnHeader(templateData: TColumnHeaderTemplateData, descriptor: ITableColumnHeaderDescriptor): void {
		this.renderer.renderColumnHeader(templateData, descriptor);
	}

	public renderCorner(cell: HTMLElement): void {
		this.renderer.renderCorner?.(cell);
	}

	public renderRowHeader(cell: HTMLTableCellElement, descriptor: ITableRowHeaderDescriptor): void {
		this.renderer.renderRowHeader(cell, descriptor);
	}

	public dispose(): void {
		this.cancelPendingRequests();
	}

	private cancelStateRequest(state: PagedTableBodyCellTemplateData<TRow, TBodyTemplateData>): void {
		const request = state.request;
		if (!request) {
			return;
		}

		state.request = null;
		this.pendingRequests.delete(request);
		request.cancel();
	}

	private cancelPendingRequests(): void {
		for (const request of this.pendingRequests) {
			request.cancel();
		}
		this.pendingRequests.clear();
	}
}
