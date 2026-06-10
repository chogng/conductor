/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import { searchSeriesAtX } from "src/cs/workbench/services/search/browser/searchModel";
import { buildSearchIndex } from "src/cs/workbench/services/search/browser/searchIndex";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
	ISearchService,
	type ISearchService as ISearchServiceType,
	type SearchIndex,
	type SearchNavigationTarget,
	type SearchPoint,
	type SearchQuery,
	type SearchResult,
	type SearchResultKind,
	type SearchScope,
	type SearchState,
} from "src/cs/workbench/services/search/common/search";

const defaultSearchQuery: SearchQuery = {
	text: "",
	scope: "curve",
	kinds: ["curve"],
	caseSensitive: false,
};

export class SearchService extends Disposable implements ISearchServiceType {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSearchStateEmitter = this._register(new Emitter<SearchState>());
	public readonly onDidChangeSearchState = this.onDidChangeSearchStateEmitter.event;
	private readonly onDidChangeSearchPlotModelEmitter = this._register(new Emitter<PlotMainRenderModel | null>());
	public readonly onDidChangeSearchPlotModel = this.onDidChangeSearchPlotModelEmitter.event;

	private state: SearchState = {
		query: defaultSearchQuery,
		selectedResultId: null,
	};
	private plotModel: PlotMainRenderModel | null = null;

	public getState(): SearchState {
		return this.state;
	}

	public buildIndex(snapshot: SessionSnapshot): SearchIndex {
		return buildSearchIndex(snapshot);
	}

	public getPlotModel(): PlotMainRenderModel | null {
		return this.plotModel;
	}

	public searchSnapshot(
		snapshot: SessionSnapshot,
		query: Partial<SearchQuery> = {},
	): readonly SearchResult[] {
		const normalizedQuery = normalizeSearchQuery({
			...this.state.query,
			...query,
		});
		const text = normalizedQuery.caseSensitive
			? normalizedQuery.text.trim()
			: normalizedQuery.text.trim().toLowerCase();
		const kinds = new Set(normalizedQuery.kinds);
		return this.buildIndex(snapshot).results
			.filter(result => matchesScope(result, normalizedQuery.scope))
			.filter(result => kinds.has(result.kind))
			.filter(result => !text || matchesText(result, text, normalizedQuery.caseSensitive))
			.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
	}

	public resolveResultTarget(result: SearchResult): SearchNavigationTarget | null {
		if (result.sourceRange) {
			return {
				kind: "rawTableRange",
				range: result.sourceRange,
			};
		}
		if (result.curveKey && result.fileId) {
			return {
				curveKey: result.curveKey,
				fileId: result.fileId,
				kind: "curve",
			};
		}
		if (result.metricKey && result.fileId) {
			return {
				fileId: result.fileId,
				kind: "metric",
				metricKey: result.metricKey,
			};
		}
		if (result.measurementBlockId && result.fileId) {
			return {
				fileId: result.fileId,
				kind: "block",
				measurementBlockId: result.measurementBlockId,
			};
		}
		if (result.fileId) {
			return {
				fileId: result.fileId,
				kind: "file",
			};
		}
		return null;
	}

	public searchPlotModelAtText(
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

		return searchSeriesAtX(model.seriesList, x);
	}

	public setPlotModel(model: PlotMainRenderModel | null): void {
		if (this.plotModel === model) {
			return;
		}

		this.plotModel = model;
		this.onDidChangeSearchPlotModelEmitter.fire(model);
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
}

const normalizeSearchQuery = (query: SearchQuery): SearchQuery => ({
	text: normalizeSearchText(query.text),
	scope: normalizeSearchScope(query.scope),
	kinds: normalizeSearchResultKinds(query.kinds),
	caseSensitive: query.caseSensitive === true,
});

const normalizeSearchText = (text: string): string =>
	String(text ?? "");

const normalizeSearchScope = (scope: SearchScope): SearchScope =>
	scope === "all" ||
	scope === "table" ||
	scope === "block" ||
	scope === "metric"
		? scope
		: "curve";

const normalizeSearchResultKinds = (
	kinds: readonly SearchResultKind[],
): readonly SearchResultKind[] => {
	const allowed = new Set<SearchResultKind>([
		"rawCell",
		"rawTable",
		"group",
		"block",
		"column",
		"curve",
		"metric",
		"parameter",
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
	if (scope === "metric") {
		return result.kind === "metric" || result.kind === "parameter";
	}
	return result.kind === "curve";
};

const matchesText = (
	result: SearchResult,
	text: string,
	caseSensitive: boolean,
): boolean => {
	const haystack = [
		result.title,
		result.preview,
		result.fileId,
		result.rawTableId,
		result.measurementBlockId,
		result.curveKey,
		result.metricKey,
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
	areStringArraysEqual(current.kinds, next.kinds);

const areStringArraysEqual = (
	first: readonly string[],
	second: readonly string[],
): boolean =>
	first.length === second.length &&
	first.every((value, index) => value === second[index]);

registerSingleton(ISearchService, SearchService, InstantiationType.Delayed);
