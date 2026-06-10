/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IChartService,
	type ChartAxisTitleEditRequest,
	type ChartDetailPane,
	type ChartState,
	type IChartService as IChartServiceType,
} from "src/cs/workbench/services/chart/common/chart";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";

export class ChartService extends Disposable implements IChartServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeChartStateEmitter = this._register(new Emitter<ChartState>());
	public readonly onDidChangeChartState = this.onDidChangeChartStateEmitter.event;
	private readonly onDidChangeChartViewInputEmitter =
		this._register(new Emitter<ChartViewInput | null>());
	public readonly onDidChangeChartViewInput =
		this.onDidChangeChartViewInputEmitter.event;
	private readonly onDidRequestAxisTitleEditEmitter = this._register(new Emitter<ChartAxisTitleEditRequest>());
	public readonly onDidRequestAxisTitleEdit = this.onDidRequestAxisTitleEditEmitter.event;

	private state: ChartState = {
		visibleDetailPanes: ["inspector"],
		hiddenLegendKeysByContext: {},
		legendPopoverContextKey: null,
	};
	private viewInput: ChartViewInput | null = null;

	public getState(): ChartState {
		return this.state;
	}

	public getViewInput(): ChartViewInput | null {
		return this.viewInput;
	}

	public updateViewInput(input: ChartViewInput): void {
		this.viewInput = input;
		this.onDidChangeChartViewInputEmitter.fire(input);
	}

	public toggleDetailPane(pane: ChartDetailPane): void {
		const nextVisibleDetailPanes = this.state.visibleDetailPanes.includes(pane)
			? this.state.visibleDetailPanes.filter(item => item !== pane)
			: [...this.state.visibleDetailPanes, pane];
		this.updateState({
			visibleDetailPanes: normalizeDetailPanes(nextVisibleDetailPanes),
		});
	}

	public requestAxisTitleEdit(request: ChartAxisTitleEditRequest): void {
		const axis = request.axis === "y" ? "y" : "x";
		const pane = request.pane === "inspector" ? "inspector" : "chart";
		this.onDidRequestAxisTitleEditEmitter.fire({ axis, pane });
	}

	public setLegendPopoverContextKey(contextKey: string | null): void {
		const normalizedContextKey = normalizeString(contextKey ?? "");
		this.updateState({
			legendPopoverContextKey: normalizedContextKey || null,
		});
	}

	public getHiddenLegendKeys(
		contextKey: string,
		liveLegendKeys: readonly string[],
	): readonly string[] {
		const liveKeys = new Set(normalizeStrings(liveLegendKeys));
		return (this.state.hiddenLegendKeysByContext[contextKey] ?? [])
			.filter(legendKey => liveKeys.has(legendKey));
	}

	public toggleHiddenLegendKey(
		contextKey: string,
		legendKey: string,
		liveLegendKeys: readonly string[],
	): void {
		const normalizedContextKey = normalizeString(contextKey);
		const normalizedLegendKey = normalizeString(legendKey);
		if (!normalizedContextKey || !normalizedLegendKey) {
			return;
		}

		const liveKeys = normalizeStrings(liveLegendKeys);
		if (!liveKeys.includes(normalizedLegendKey)) {
			return;
		}

		const current = this.getHiddenLegendKeys(normalizedContextKey, liveKeys);
		const next = current.includes(normalizedLegendKey)
			? current.filter(item => item !== normalizedLegendKey)
			: [...current, normalizedLegendKey];
		const hiddenLegendKeysByContext = {
			...this.state.hiddenLegendKeysByContext,
		};
		if (next.length) {
			hiddenLegendKeysByContext[normalizedContextKey] = next;
		} else {
			delete hiddenLegendKeysByContext[normalizedContextKey];
		}

		this.updateState({
			hiddenLegendKeysByContext,
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
	panes: readonly ChartDetailPane[],
): readonly ChartDetailPane[] => {
	const result: ChartDetailPane[] = [];
	for (const pane of panes) {
		if (pane === "inspector" && !result.includes(pane)) {
			result.push(pane);
		}
	}

	return result;
};

const normalizeStrings = (values: readonly string[]): readonly string[] => {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		const normalized = normalizeString(value);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		seen.add(normalized);
		result.push(normalized);
	}

	return result;
};

const normalizeString = (value: string): string =>
	String(value ?? "").trim();

const isSameChartState = (current: ChartState, next: ChartState): boolean =>
	areStringArraysEqual(current.visibleDetailPanes, next.visibleDetailPanes) &&
	areHiddenLegendMapsEqual(current.hiddenLegendKeysByContext, next.hiddenLegendKeysByContext) &&
	current.legendPopoverContextKey === next.legendPopoverContextKey;

const areHiddenLegendMapsEqual = (
	first: Readonly<Record<string, readonly string[]>>,
	second: Readonly<Record<string, readonly string[]>>,
): boolean => {
	const firstKeys = Object.keys(first).sort();
	const secondKeys = Object.keys(second).sort();
	if (!areStringArraysEqual(firstKeys, secondKeys)) {
		return false;
	}

	return firstKeys.every(key => areStringArraysEqual(first[key] ?? [], second[key] ?? []));
};

const areStringArraysEqual = (
	first: readonly string[],
	second: readonly string[],
): boolean =>
	first.length === second.length &&
	first.every((value, index) => value === second[index]);

registerSingleton(IChartService, ChartService, InstantiationType.Delayed);
