/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from "src/cs/base/common/cancellation";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { IPagedModel } from "src/cs/base/common/paging";
import type {
	ITableBodyCellDescriptor,
	ITableColumnHeaderDescriptor,
	ITablePagedWidgetRenderer,
	ITableRowHeaderDescriptor,
	ITableWidgetRenderer,
} from "src/cs/base/browser/ui/table/table";

type PagedTableBodyCellState = {
	cts: CancellationTokenSource | null;
	renderVersion: number;
};

const createBodyCellState = (): PagedTableBodyCellState => ({
	cts: null,
	renderVersion: 0,
});

export class PagedTableWidgetRenderer<TRow> implements ITableWidgetRenderer, IDisposable {
	private readonly cellStates = new WeakMap<HTMLTableCellElement, PagedTableBodyCellState>();
	private readonly pendingRequests = new Set<CancellationTokenSource>();

	public constructor(
		private model: IPagedModel<TRow>,
		private readonly renderer: ITablePagedWidgetRenderer<TRow>,
	) {}

	public setModel(model: IPagedModel<TRow>): void {
		if (this.model === model) {
			return;
		}

		this.cancelPendingRequests();
		this.model = model;
	}

	public clearBodyCell(cell: HTMLTableCellElement): void {
		this.cancelCellRequest(cell);
		this.renderer.clearBodyCell?.(cell);
	}

	public disposeBodyCell(cell: HTMLTableCellElement): void {
		this.cancelCellRequest(cell);
		this.renderer.disposeBodyCell?.(cell);
		this.cellStates.delete(cell);
	}

	public renderBodyCell(cell: HTMLTableCellElement, descriptor: ITableBodyCellDescriptor): void {
		this.getCellState(cell);
		this.renderer.renderBodyCell?.(cell, descriptor);
	}

	public renderBodyCellContent(content: HTMLElement, descriptor: ITableBodyCellDescriptor): void {
		const cell = content.closest("td");
		if (!(cell instanceof HTMLTableCellElement)) {
			return;
		}

		const state = this.getCellState(cell);
		this.cancelStateRequest(state);
		state.renderVersion += 1;
		const renderVersion = state.renderVersion;
		const rowIndex = descriptor.rowIndex;

		if (this.model.isResolved(rowIndex)) {
			this.renderer.renderBodyCellContent(content, {
				...descriptor,
				row: this.model.get(rowIndex),
			});
			return;
		}

		if (this.renderer.renderBodyCellPlaceholder) {
			this.renderer.renderBodyCellPlaceholder(content, descriptor);
		} else {
			content.replaceChildren();
		}
		const cts = new CancellationTokenSource();
		state.cts = cts;
		this.pendingRequests.add(cts);

		let rowPromise: Promise<TRow>;
		try {
			rowPromise = this.model.resolve(rowIndex, cts.token);
		} catch {
			if (state.cts === cts) {
				state.cts = null;
			}
			this.pendingRequests.delete(cts);
			cts.dispose();
			return;
		}

		rowPromise.then(row => {
			if (
				cts.token.isCancellationRequested ||
				state.cts !== cts ||
				state.renderVersion !== renderVersion
			) {
				return;
			}

			state.cts = null;
			this.pendingRequests.delete(cts);
			cts.dispose();
			this.renderer.renderBodyCellContent(content, {
				...descriptor,
				row,
			});
		}, () => {
			if (state.cts === cts) {
				state.cts = null;
			}
			this.pendingRequests.delete(cts);
			cts.dispose();
		});
	}

	public renderColumnHeader(cell: HTMLElement, descriptor: ITableColumnHeaderDescriptor): void {
		this.renderer.renderColumnHeader(cell, descriptor);
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

	private getCellState(cell: HTMLTableCellElement): PagedTableBodyCellState {
		let state = this.cellStates.get(cell);
		if (!state) {
			state = createBodyCellState();
			this.cellStates.set(cell, state);
		}

		return state;
	}

	private cancelCellRequest(cell: HTMLTableCellElement): void {
		const state = this.cellStates.get(cell);
		if (state) {
			this.cancelStateRequest(state);
		}
	}

	private cancelStateRequest(state: PagedTableBodyCellState): void {
		const cts = state.cts;
		if (!cts) {
			return;
		}

		state.cts = null;
		this.pendingRequests.delete(cts);
		cts.cancel();
		cts.dispose();
	}

	private cancelPendingRequests(): void {
		for (const cts of this.pendingRequests) {
			cts.cancel();
			cts.dispose();
		}
		this.pendingRequests.clear();
	}
}
