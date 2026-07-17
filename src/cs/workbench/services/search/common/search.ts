/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import type { URI } from "src/cs/base/common/uri";
import type { DataResourceStructuredContentSnapshot } from "src/cs/workbench/services/dataResource/common/dataResource";

export const ISearchService = createDecorator<ISearchService>("searchService");
export const SearchContributionId = "workbench.contrib.search";
export const SearchViewContainerId = "workbench.viewContainer.search";
export const SearchViewId = "workbench.search";

export type SearchScope =
	| "all"
	| "table"
	| "block";

export type SearchResultKind =
	| "rawCell"
	| "rawTable"
	| "group"
	| "block"
	| "column";

export type SearchInterpolationMode =
	| "linear"
	| "none";

export type SearchQuery = {
	readonly text: string;
	readonly scope: SearchScope;
	readonly kinds: readonly SearchResultKind[];
	readonly caseSensitive: boolean;
	readonly interpolationMode: SearchInterpolationMode;
};

export type SearchState = {
	readonly query: SearchQuery;
	readonly selectedResultId: string | null;
};

export type ResourceTableRangeRef = {
	readonly resource: URI;
	readonly sheetId?: string | null;
	readonly columnEnd: number;
	readonly columnStart: number;
	readonly rowEnd: number;
	readonly rowStart: number;
};

export type SearchResult = {
	readonly id: string;
	readonly kind: SearchResultKind;
	readonly title: string;
	readonly preview?: string;
	readonly score: number;
	readonly resource?: URI;
	readonly resourceRange?: ResourceTableRangeRef;
	readonly sheetId?: string | null;
	readonly measurementBlockId?: string;
	readonly groupId?: string;
};

export type SearchIndex = {
	readonly signature: string;
	readonly results: readonly SearchResult[];
};

export type SearchNavigationTarget =
	{ readonly kind: "tableResourceRange"; readonly range: ResourceTableRangeRef };

export type SearchPointStatus = "empty" | "noExactMatch" | "outOfRange" | "ready";

export type SearchPoint = {
	readonly color?: string;
	readonly seriesId: string;
	readonly seriesName: string;
	readonly status: SearchPointStatus;
	readonly x: number;
	readonly y: number | null;
};

export type SearchPointLookupPaneId = "main" | "inspector";

export type SearchPointLookupPaneModel = {
	readonly id: SearchPointLookupPaneId;
	readonly model: PlotMainRenderModel;
};

export type SearchPointLookupModel = {
	readonly panes: readonly SearchPointLookupPaneModel[];
};

export interface ISearchService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeSearchState: Event<SearchState>;
	readonly onDidChangeSearchPointLookupModel: Event<SearchPointLookupModel | null>;

	buildStructuredContentIndex(snapshot: DataResourceStructuredContentSnapshot): SearchIndex;
	getPointLookupModel(): SearchPointLookupModel | null;
	getState(): SearchState;
	resolveResultTarget(result: SearchResult): SearchNavigationTarget | null;
	searchStructuredContent(snapshot: DataResourceStructuredContentSnapshot, query?: Partial<SearchQuery>): readonly SearchResult[];
	searchPointsAtText(model: PlotMainRenderModel | null, text: string): readonly SearchPoint[] | null;
	setQuery(query: SearchQuery): void;
	updateQuery(updates: Partial<SearchQuery>): void;
	setInterpolationMode(interpolationMode: SearchInterpolationMode): void;
	setQueryText(text: string): void;
	setSelectedResultId(resultId: string | null): void;
}
