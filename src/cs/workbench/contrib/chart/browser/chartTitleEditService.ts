/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ChartAxisTitleEditRequest } from "src/cs/workbench/services/chart/common/chart";

export const IChartTitleEditService = createDecorator<IChartTitleEditService>("chartTitleEditService");

export interface ChartTitleEditHandler {
	editAxisTitle(request: ChartAxisTitleEditRequest): void;
}

export interface IChartTitleEditService {
	readonly _serviceBrand: undefined;

	registerHandler(handler: ChartTitleEditHandler): IDisposable;
	editAxisTitle(request: ChartAxisTitleEditRequest): boolean;
}

export class ChartTitleEditService extends Disposable implements IChartTitleEditService {
	public declare readonly _serviceBrand: undefined;

	private readonly handlers = new Set<ChartTitleEditHandler>();

	public registerHandler(handler: ChartTitleEditHandler) {
		this.handlers.add(handler);
		return toDisposable(() => {
			this.handlers.delete(handler);
		});
	}

	public editAxisTitle(request: ChartAxisTitleEditRequest): boolean {
		const handler = this.getActiveHandler();
		if (!handler) {
			return false;
		}

		handler.editAxisTitle(normalizeChartAxisTitleEditRequest(request));
		return true;
	}

	private getActiveHandler(): ChartTitleEditHandler | null {
		let activeHandler: ChartTitleEditHandler | null = null;
		for (const handler of this.handlers) {
			activeHandler = handler;
		}

		return activeHandler;
	}
}

registerSingleton(IChartTitleEditService, ChartTitleEditService, InstantiationType.Delayed);

function normalizeChartAxisTitleEditRequest(
	request: ChartAxisTitleEditRequest,
): ChartAxisTitleEditRequest {
	return {
		axis: request.axis === "y" ? "y" : "x",
		pane: request.pane === "inspector" ? "inspector" : "chart",
	};
}
