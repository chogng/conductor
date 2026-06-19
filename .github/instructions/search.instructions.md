---
description: Search service - query state, search index, raw table/block/curve/metric results, source range navigation, and plot point search.
applyTo: 'src/cs/workbench/services/search/**,src/cs/workbench/contrib/search/**'
---
# Search

Search is a consumer and indexer. It does not produce canonical data.

## Ownership

`ISearchService` owns query state, selected result, indexes from Session,
results for raw cells/tables/groups/blocks/columns/curves/metrics/parameters,
and navigation target generation.

It consumes Session, assessment results, optional Plot display models for
currently plotted chart/inspector series, and owner services for reveal
requests. It does not own import, assessment, template execution, plot
calculation, or Session mutation.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/search.ts` | service contract, query/result types, navigation targets. |
| `browser/searchService.ts` | query/selection state owner, session/plot subscriber. |
| `browser/searchIndex.ts` | pure index builder from files/raw tables/blocks/curves/metrics. |
| `browser/searchNavigation.ts` | result -> Explorer/Table/Plot/Parameters reveal commands. |
| `contrib/search/browser/searchViewPane.ts` | view shell. |
| `contrib/search/browser/searchView.ts` | DOM/UI renderer; no Session reads. |

## Flow

```txt
SessionSnapshot + optional cached PlotDisplayModel
  -> SearchIndex / SearchPlotModel
  -> ISearchService query
  -> SearchResult[]
  -> explicit reveal target dispatch
```

Search result navigation uses refs such as `RawTableRangeRef`, block id, curve
key, metric key, file id, or resource id. It must not depend on global Session
active state.

## Plot Point Search

Plot point search consumes a Search-owned projection of the current cached
`PlotDisplayModel`. Workbench may prefetch active Plot display models on cache
miss, but must not synchronously create them during Search render.

Panes:

- `chart`: main plot point table from chart display model.
- `inspector`: second-order/inspector point table.

The view owns one X input and one interpolation select applied to both panes.
Point lookup results are derived display data and must not be written to
Session.

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

## Field Catalog

Use `records.instructions.md` for `SearchQuery`, `SearchResult`,
`SearchPlotModel`, and `SearchPlotPaneModel`.

## Do Not

- Do not re-detect block structure.
- Do not update canonical records from results.
- Do not store query state in Session.
- Do not make SearchView read Session directly.
