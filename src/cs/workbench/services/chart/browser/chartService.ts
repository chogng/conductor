/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IChartService,
	type ChartDetailPane,
	type ChartState,
	type IChartService as IChartServiceType,
} from "src/cs/workbench/services/chart/common/chart";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";

const DEFAULT_VISIBLE_DETAIL_PANES: readonly ChartDetailPane[] = [];

export class ChartService extends Disposable implements IChartServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeChartStateEmitter = this._register(new Emitter<ChartState>());
	public readonly onDidChangeChartState = this.onDidChangeChartStateEmitter.event;
	private readonly onDidChangeChartViewInputEmitter =
		this._register(new Emitter<void>());
	public readonly onDidChangeChartViewInput =
		this.onDidChangeChartViewInputEmitter.event;

	private state: ChartState;
	private viewInput: ChartViewInput | null = null;

	constructor() {
		super();
		this.state = {
			visibleDetailPanes: DEFAULT_VISIBLE_DETAIL_PANES,
			legendPopoverContextKey: null,
		};
	}

	public getState(): ChartState {
		return this.state;
	}

	public getViewInput(): ChartViewInput | null {
		return this.viewInput;
	}

	public updateViewInput(input: ChartViewInput): void {
		if (this.viewInput && isSameChartViewInput(this.viewInput, input)) {
			return;
		}

		this.viewInput = input;
		this.onDidChangeChartViewInputEmitter.fire(undefined);
	}

	public toggleDetailPane(pane: ChartDetailPane): void {
		const nextVisibleDetailPanes = this.state.visibleDetailPanes.includes(pane)
			? this.state.visibleDetailPanes.filter(item => item !== pane)
			: [...this.state.visibleDetailPanes, pane];
		this.updateState({
			visibleDetailPanes: normalizeDetailPanes(nextVisibleDetailPanes),
		});
	}

	public setLegendPopoverContextKey(contextKey: string | null): void {
		const normalizedContextKey = normalizeString(contextKey ?? "");
		this.updateState({
			legendPopoverContextKey: normalizedContextKey || null,
		});
	}

	private updateState(updates: Partial<ChartState>): void {
		const nextState = {
			...this.state,
			...updates,
		};
		if (isSameChartState(this.state, nextState)) {
			return;
		}

		this.state = nextState;
		this.onDidChangeChartStateEmitter.fire(nextState);
	}
}

const normalizeDetailPanes = (
	panes: readonly unknown[],
): readonly ChartDetailPane[] => {
	const result: ChartDetailPane[] = [];
	for (const pane of panes) {
		if (pane === "inspector" && !result.includes(pane)) {
			result.push(pane);
		}
	}

	return result;
};

const normalizeString = (value: string): string =>
	String(value ?? "").trim();

const isSameChartState = (current: ChartState, next: ChartState): boolean =>
	areStringArraysEqual(current.visibleDetailPanes, next.visibleDetailPanes) &&
	current.legendPopoverContextKey === next.legendPopoverContextKey;

const areStringArraysEqual = (
	first: readonly string[],
	second: readonly string[],
): boolean =>
	first.length === second.length &&
	first.every((value, index) => value === second[index]);

const isSameChartViewInput = (
	current: ChartViewInput,
	next: ChartViewInput,
): boolean =>
	current.activeFileId === next.activeFileId &&
	current.activePlotType === next.activePlotType &&
	current.hasChartData === next.hasChartData &&
	current.showFileSelect === next.showFileSelect &&
	current.shouldMountCharts === next.shouldMountCharts &&
	isSameProcessingStatus(current.processingStatus, next.processingStatus) &&
	areChartFileOptionsEqual(
		current.chartFileOptions ?? [],
		next.chartFileOptions ?? [],
	);

const isSameProcessingStatus = (
	current: ChartViewInput["processingStatus"],
	next: ChartViewInput["processingStatus"],
): boolean =>
	current?.state === next?.state &&
	current?.processed === next?.processed &&
	current?.total === next?.total;

const areChartFileOptionsEqual = (
	first: NonNullable<ChartViewInput["chartFileOptions"]>,
	second: NonNullable<ChartViewInput["chartFileOptions"]>,
): boolean =>
	first.length === second.length &&
	first.every((option, index) =>
		option.fileId === second[index]?.fileId &&
		option.fileName === second[index]?.fileName);

registerSingleton(IChartService, ChartService, InstantiationType.Delayed);
