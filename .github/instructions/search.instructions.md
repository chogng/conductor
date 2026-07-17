---
description: Search service - query state, URI structured-content index/results, resource navigation, and chart point lookup.
applyTo: 'src/cs/workbench/services/search/**,src/cs/workbench/contrib/search/**'
---
# Search

Search is a consumer and indexer. It does not produce canonical data.

## Ownership

`ISearchService` owns query state, selected result, indexes from explicit
URI structured-content snapshots, results for resource-backed
cells/tables/groups/blocks/columns, and navigation target generation.

It consumes URI-backed `DataResourceStructuredContentSnapshot` values for
resource table/search results. Search also consumes optional Plot display models
for currently plotted chart/inspector series and owner services for reveal
requests. It does not inject a global data ledger for point lookup; Plot owns current
snapshot resolution for plot display models.
Workbench auxiliary refresh scheduling must not refresh Search from Explorer,
Chart, or Plot owner events; Search updates through its own explicit URI/search
inputs and owner subscriptions.
It does not own import, table-model production, template execution, plot
calculation, or another domain's state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/search.ts` | service contract, query/result types, navigation targets. |
| `browser/searchService.ts` | query/selection state owner, chart/plot subscriber, explicit URI structured-content search helpers. |
| `browser/searchIndex.ts` | pure index builder from URI structured content. |
| `contrib/search/browser/searchViewPane.ts` | view shell. |
| `contrib/search/browser/searchView.ts` | DOM/UI renderer; no domain-service reads. |

## Flow

```txt
DataResourceStructuredContentSnapshot -> SearchIndex
Chart state/input + optional cached PlotDisplayModel
  -> SearchPointLookupModel
  -> ISearchService query
  -> SearchResult[]
  -> explicit reveal target dispatch
```

Search result navigation uses URI refs such as `ResourceTableRangeRef`, block
id, group id, or resource id. It must not depend on global active-resource state.

## Chart Point Lookup

Chart point lookup consumes a Search-owned projection of the current cached
`PlotDisplayModel`. SearchService may request active Plot display-model prefetch
on cache miss, but must not synchronously create display models during Search
render.

Panes:

- `main`: point lookup table from the central main chart display model.
- `inspector`: point lookup table from the central inspector/detail chart display model.

The view owns one X input and one interpolation select applied to both panes.
Point lookup results are derived display data and remain Search-owned.

Supported modes:

| Mode | Behavior |
| --- | --- |
| `linear` | exact point when present, otherwise linear interpolation between adjacent finite X points |
| `none` | exact X point required |

Do not add interpolation options without implementing and testing the algorithm
in search model code.

## View Rules

- Search form rows use the same two-column control layout as neighboring chart auxiliary views.
- Control column children use `min-width: 0` and `width: 100%`.
- X input is text with `inputMode = "decimal"`, not `type = "number"`.
- Do not rebuild the full Search view for every `SearchQuery` change; update current result table in place so input focus survives.

## Do Not

- Do not re-detect block structure.
- Do not update canonical records from results.
- Do not store query state outside `ISearchService`.
- Do not make SearchView read domain services directly.
