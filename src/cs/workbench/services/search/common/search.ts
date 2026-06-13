/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { PlotMainRenderModel } from "src/cs/workbench/services/plot/common/plotModel";
import type {
	CurveKey,
	FileId,
	MetricKey,
	SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";

export const ISearchService = createDecorator<ISearchService>("searchService");
export const SearchContributionId = "workbench.contrib.search";
export const SearchViewId = "workbench.search";

export const SearchCommandId = {
	showSearch: "workbench.action.showSearch",
} as const;

export type SearchCommandId = typeof SearchCommandId[keyof typeof SearchCommandId];

export type SearchScope =
	| "all"
	| "table"
	| "block"
	| "curve"
	| "metric";

export type SearchResultKind =
	| "rawCell"
	| "rawTable"
	| "group"
	| "block"
	| "column"
	| "curve"
	| "metric"
	| "parameter";

export type SearchQuery = {
	readonly text: string;
	readonly scope: SearchScope;
	readonly kinds: readonly SearchResultKind[];
	readonly caseSensitive: boolean;
};

export type SearchState = {
	readonly query: SearchQuery;
	readonly selectedResultId: string | null;
};

export type RawTableRangeRef = {
	readonly fileId: FileId;
	readonly rawTableId: SheetId;
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
	readonly fileId?: FileId;
	readonly rawTableId?: SheetId;
	readonly sourceRange?: RawTableRangeRef;
	readonly measurementBlockId?: string;
	readonly curveKey?: CurveKey;
	readonly metricKey?: MetricKey;
	readonly groupId?: string;
};

export type SearchIndex = {
	readonly signature: string;
	readonly results: readonly SearchResult[];
};

export type SearchNavigationTarget =
	| { readonly kind: "file"; readonly fileId: FileId }
	| { readonly kind: "rawTableRange"; readonly range: RawTableRangeRef }
	| { readonly kind: "curve"; readonly curveKey: CurveKey; readonly fileId: FileId }
	| { readonly kind: "metric"; readonly metricKey: MetricKey; readonly fileId: FileId }
	| { readonly kind: "block"; readonly fileId: FileId; readonly measurementBlockId: string };

export type SearchPointStatus = "empty" | "outOfRange" | "ready";

export type SearchPoint = {
	readonly color?: string;
	readonly seriesId: string;
	readonly seriesName: string;
	readonly status: SearchPointStatus;
	readonly x: number;
	readonly y: number | null;
};

export interface ISearchService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeSearchState: Event<SearchState>;
	readonly onDidChangeSearchPlotModel: Event<PlotMainRenderModel | null>;

	buildIndex(snapshot: SessionSnapshot): SearchIndex;
	getPlotModel(): PlotMainRenderModel | null;
	getState(): SearchState;
	resolveResultTarget(result: SearchResult): SearchNavigationTarget | null;
	searchSnapshot(snapshot: SessionSnapshot, query?: Partial<SearchQuery>): readonly SearchResult[];
	searchPlotModelAtText(model: PlotMainRenderModel | null, text: string): readonly SearchPoint[] | null;
	setPlotModel(model: PlotMainRenderModel | null): void;
	setQuery(query: SearchQuery): void;
	updateQuery(updates: Partial<SearchQuery>): void;
	setQueryText(text: string): void;
	setSelectedResultId(resultId: string | null): void;
}
