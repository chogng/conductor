/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IChartService,
	type IChartService as IChartServiceType,
} from "src/cs/workbench/services/chart/common/chart";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import {
	createSearchPointLookupModelFromPlotDisplay,
	searchSeriesAtX,
} from "src/cs/workbench/services/search/browser/searchModel";
import {
	buildStructuredContentSearchIndex,
} from "src/cs/workbench/services/search/browser/searchIndex";
import {
	IPlotService,
	type IPlotService as IPlotServiceType,
	type PlotDisplayModelInput,
} from "src/cs/workbench/services/plot/common/plot";
import type { SliceResourceTarget } from "src/cs/workbench/services/slice/common/slice";
import type { DataResourceStructuredContentSnapshot } from "src/cs/workbench/services/dataResource/common/dataResource";
import {
	ISearchService,
	type ISearchService as ISearchServiceType,
	type SearchIndex,
	type SearchInterpolationMode,
	type SearchNavigationTarget,
	type SearchPoint,
	type SearchPointLookupModel,
	type SearchQuery,
	type SearchResult,
	type SearchResultKind,
	type SearchScope,
	type SearchState,
} from "src/cs/workbench/services/search/common/search";

const defaultSearchQuery: SearchQuery = {
	text: "",
	scope: "all",
	kinds: ["rawCell", "rawTable", "column", "group", "block"],
	caseSensitive: false,
	interpolationMode: "linear",
};

export class SearchService extends Disposable implements ISearchServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSearchStateEmitter = this._register(new Emitter<SearchState>());
	public readonly onDidChangeSearchState = this.onDidChangeSearchStateEmitter.event;
	private readonly onDidChangeSearchPointLookupModelEmitter = this._register(new Emitter<SearchPointLookupModel | null>());
	public readonly onDidChangeSearchPointLookupModel = this.onDidChangeSearchPointLookupModelEmitter.event;

	private state: SearchState = {
		query: defaultSearchQuery,
		selectedResultId: null,
	};
	private pointLookupModel: SearchPointLookupModel | null = null;

	constructor(
		@IChartService private readonly chartService: IChartServiceType,
		@IPlotService private readonly plotService: IPlotServiceType,
	) {
		super();

		this._register(this.chartService.onDidChangeChartState(() => this.refreshPointLookupModel()));
		this._register(this.chartService.onDidChangeChartViewInput(() => this.refreshPointLookupModel()));
		this._register(this.plotService.onDidChangePlotState(() => this.refreshPointLookupModel()));
		this._register(this.plotService.onDidChangePlotDisplayModelCache(() => this.refreshPointLookupModel()));
		this.refreshPointLookupModel();
	}

	public getState(): SearchState {
		return this.state;
	}

	public buildStructuredContentIndex(snapshot: DataResourceStructuredContentSnapshot): SearchIndex {
		return buildStructuredContentSearchIndex(snapshot);
	}

	public getPointLookupModel(): SearchPointLookupModel | null {
		return this.pointLookupModel;
	}

	public searchStructuredContent(
		snapshot: DataResourceStructuredContentSnapshot,
		query: Partial<SearchQuery> = {},
	): readonly SearchResult[] {
		return this.searchIndex(this.buildStructuredContentIndex(snapshot), query);
	}

	private searchIndex(
		index: SearchIndex,
		query: Partial<SearchQuery>,
	): readonly SearchResult[] {
		const normalizedQuery = normalizeSearchQuery({
			...this.state.query,
			...query,
		});
		const text = normalizedQuery.caseSensitive
			? normalizedQuery.text.trim()
			: normalizedQuery.text.trim().toLowerCase();
		const kinds = new Set(normalizedQuery.kinds);
		return index.results
			.filter(result => matchesScope(result, normalizedQuery.scope))
			.filter(result => kinds.has(result.kind))
			.filter(result => !text || matchesText(result, text, normalizedQuery.caseSensitive))
			.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
	}

	public resolveResultTarget(result: SearchResult): SearchNavigationTarget | null {
		if (result.resourceRange) {
			return {
				kind: "tableResourceRange",
				range: result.resourceRange,
			};
		}
		return null;
	}

	public searchPointsAtText(
		model: PlotMainRenderModel | null,
		text: string,
	): readonly SearchPoint[] | null {
		if (!model) {
			return null;
		}

		const x = Number(text);
		if (!Number.isFinite(x)) {
			return null;
		}

		return searchSeriesAtX(model.seriesList, x, this.state.query.interpolationMode);
	}

	public setPointLookupModel(model: SearchPointLookupModel | null): void {
		if (this.pointLookupModel === model) {
			return;
		}

		this.pointLookupModel = model;
		this.onDidChangeSearchPointLookupModelEmitter.fire(model);
	}

	private refreshPointLookupModel(): void {
		const chartInput = this.chartService.getViewInput();
		const fileId = normalizeSearchText(chartInput?.activeFileId ?? "").trim();
		if (!fileId || chartInput?.hasChartData !== true) {
			this.setPointLookupModel(null);
			return;
		}

		const plotDisplayModelInput = this.createPointLookupPlotDisplayModelInput(
			fileId,
			chartInput.activePlotType ?? this.plotService.getState().activePlotType,
			chartInput.activeTarget ?? null,
		);
		const plotDisplayModel = this.plotService.getCachedPlotDisplayModel(plotDisplayModelInput);
		if (!plotDisplayModel) {
			this.plotService.prefetchPlotDisplayModel(plotDisplayModelInput, "active");
		}
		this.setPointLookupModel(createSearchPointLookupModelFromPlotDisplay(plotDisplayModel, {
			includeInspector: this.chartService.getState().visibleDetailPanes.includes("inspector"),
		}));
	}

	public setQuery(query: SearchQuery): void {
		this.updateState({
			query: normalizeSearchQuery(query),
		});
	}

	public updateQuery(updates: Partial<SearchQuery>): void {
		this.setQuery({
			...this.state.query,
			...updates,
		});
	}

	public setQueryText = (text: string): void => {
		this.updateQuery({
			text: normalizeSearchText(text),
		});
	};

	public setInterpolationMode = (interpolationMode: SearchInterpolationMode): void => {
		this.updateQuery({
			interpolationMode,
		});
	};

	public setSelectedResultId(resultId: string | null): void {
		this.updateState({
			selectedResultId: normalizeSelectedResultId(resultId),
		});
	}

	private updateState(updates: Partial<SearchState>): void {
		const nextState = {
			...this.state,
			...updates,
		};
		if (isSameSearchState(this.state, nextState)) {
			return;
		}

		this.state = nextState;
		this.onDidChangeSearchStateEmitter.fire(nextState);
	}

	private createPointLookupPlotDisplayModelInput(
		fileId: string,
		plotType: NonNullable<PlotDisplayModelInput["plotType"]>,
		target: SliceResourceTarget | null,
	): PlotDisplayModelInput {
		const legendModel = this.plotService.getCachedPlotLegendModel({
			fileId,
			plotType,
			target,
		});
		const liveLegendKeys = legendModel?.seriesList.map(series => series.id) ?? [];
		const legendFileId = legendModel?.fileId ?? fileId;
		const legendTarget = legendModel?.target ?? target;
		return {
			fileId,
			hiddenLegendKeys: liveLegendKeys.length
				? this.plotService.getHiddenLegendKeys({
					fileId: legendFileId,
					target: legendTarget,
				}, plotType, liveLegendKeys)
				: [],
			legendLabels: this.getPointLookupLegendLabels({
				fileId: legendFileId,
				target: legendTarget,
			}, liveLegendKeys),
			plotType,
			target,
		};
	}

	private getPointLookupLegendLabels(
		target: PlotDisplayModelInput,
		liveLegendKeys: readonly string[],
	): Readonly<Record<string, string>> {
		const labels = this.plotService.getLegendLabels(target);
		if (!liveLegendKeys.length) {
			return labels;
		}

		const liveKeys = new Set(liveLegendKeys);
		const next: Record<string, string> = {};
		for (const [legendKey, label] of Object.entries(labels)) {
			if (liveKeys.has(legendKey)) {
				next[legendKey] = label;
			}
		}
		return next;
	}
}

const normalizeSearchQuery = (query: SearchQuery): SearchQuery => ({
	text: normalizeSearchText(query.text),
	scope: normalizeSearchScope(query.scope),
	kinds: normalizeSearchResultKinds(query.kinds),
	caseSensitive: query.caseSensitive === true,
	interpolationMode: normalizeSearchInterpolationMode(query.interpolationMode),
});

const normalizeSearchText = (text: string): string =>
	String(text ?? "");

const normalizeSearchInterpolationMode = (value: unknown): SearchInterpolationMode =>
	value === "none" ? "none" : "linear";

const normalizeSearchScope = (scope: SearchScope): SearchScope =>
	scope === "all" ||
	scope === "table" ||
	scope === "block"
		? scope
		: defaultSearchQuery.scope;

const normalizeSearchResultKinds = (
	kinds: readonly SearchResultKind[],
): readonly SearchResultKind[] => {
	const allowed = new Set<SearchResultKind>([
		"rawCell",
		"rawTable",
		"group",
		"block",
		"column",
	]);
	const result: SearchResultKind[] = [];
	const seen = new Set<SearchResultKind>();
	for (const kind of kinds) {
		if (!allowed.has(kind) || seen.has(kind)) {
			continue;
		}

		seen.add(kind);
		result.push(kind);
	}

	return result.length ? result : defaultSearchQuery.kinds;
};

const matchesScope = (
	result: SearchResult,
	scope: SearchScope,
): boolean => {
	if (scope === "all") {
		return true;
	}
	if (scope === "table") {
		return result.kind === "rawCell" ||
			result.kind === "rawTable" ||
			result.kind === "column";
	}
	if (scope === "block") {
		return result.kind === "block" || result.kind === "group";
	}
	return true;
};

const matchesText = (
	result: SearchResult,
	text: string,
	caseSensitive: boolean,
): boolean => {
	const haystack = [
		result.title,
		result.preview,
		result.resource?.toString(),
		result.sheetId,
		result.resourceRange?.resource.toString(),
		result.resourceRange?.sheetId,
		result.measurementBlockId,
		result.groupId,
	].join("\n");
	const candidate = caseSensitive ? haystack : haystack.toLowerCase();
	return candidate.includes(text);
};

const normalizeSelectedResultId = (resultId: string | null): string | null => {
	const normalized = String(resultId ?? "").trim();
	return normalized || null;
};

const isSameSearchState = (current: SearchState, next: SearchState): boolean =>
	current.selectedResultId === next.selectedResultId &&
	isSameSearchQuery(current.query, next.query);

const isSameSearchQuery = (current: SearchQuery, next: SearchQuery): boolean =>
	current.text === next.text &&
	current.scope === next.scope &&
	current.caseSensitive === next.caseSensitive &&
	current.interpolationMode === next.interpolationMode &&
	areStringArraysEqual(current.kinds, next.kinds);

const areStringArraysEqual = (
	first: readonly string[],
	second: readonly string[],
): boolean =>
	first.length === second.length &&
	first.every((value, index) => value === second[index]);

registerSingleton(ISearchService, SearchService, InstantiationType.Delayed);
