---
description: TableFacts domain - raw-table structure, profiles, semantics, blocks, diagnostics, queue contracts, and compatibility boundaries.
applyTo: 'src/cs/workbench/services/tableFacts/**'
---
# TableFacts

TableFacts is the raw-table fact layer consumed by Template materialization.
It is not Review, not Recipe, and not Slice.

```txt
ITableFileService RawTableRecord + SchemaProfile snapshot
  -> IRawTableFactsService
  -> RawTableFactsRecord
  -> ITableFileService.commitTableFacts(...)
  + Recipe/UserTemplate snapshots
  -> Template materialization
  -> Review
  -> Slice
```

## Ownership

`services/tableFacts/common` owns formal TableFacts contracts and pure helpers:
structure detection, column profiles, semantic candidates, layout candidates,
measurement blocks, diagnostics, import-preview seed heuristics, and record
factories.

`services/tableFacts/browser` owns the injectable TableFacts producer, queue,
and lifecycle contribution. New code must import formal contracts, helpers, and
browser implementations from `services/tableFacts`.

TableFacts must not produce `TemplateDraft`, `ReviewedTemplate`,
`ReviewDecision`, `systemRecommended`, or `SliceRequest`.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/tableFacts.ts` | `RawTableFactsRecord` / `RawTableFacts` contracts, rule version, `IRawTableFactsService`, queue contract, service inputs, and raw-table ref helpers. |
| `common/tableFactsRecord.ts` | `RawTableFactsRecord` factory and normalization helpers. |
| `common/rawTableStructure.ts` | physical table structure and schema fingerprint detection. |
| `common/columnProfile.ts` | neutral raw-column profiles and measurement column projections. |
| `common/semanticCandidate.ts` | role/unit/display-scale candidates. |
| `common/layoutCandidate.ts` | shape-only binding drafts for materialization/review prefill. |
| `common/blockDetector.ts` | measurement block construction from table facts. |
| `common/measurement.ts` | measurement family/mode/block/column record types. |
| `common/diagnostics.ts` | table-fact diagnostics and source ranges. |
| `common/importTableFactsSeedHeuristics.ts` | import-preview seed and fast badge heuristics. |
| `browser/importTableFactsSeed.ts` | browser preview adapter from file/rows to `ImportTableFactsSeed`. |
| `browser/rawTableFactsEngine.ts` | browser raw-table facts workflow. |
| `browser/rawTableFactsService.ts` | injectable `IRawTableFactsService` implementation. |
| `browser/rawTableFactsQueueService.ts` | injectable queue for scheduling and committing table facts through `ITableFileService`. |
| `browser/rawTableFacts.contribution.ts` | table-file lifecycle subscriber that enqueues raw tables. |

## Rules

- TableFacts may infer structure, profiles, semantic candidates, groups,
  blocks, and diagnostics only.
- TableFacts reads raw tables from `ITableFileService` snapshots and commits
  `RawTableFactsRecord` values back through `ITableFileService`.
- Recipe is fixed selector/projection data; Template materializers interpret it
  against TableFacts.
- Review owns candidate ranking, selected reviewed template, and application
  recommendation.
- Slice executes reviewed/manual Template snapshots and must not re-detect
  table facts.
- Retired table-fact service, record, and command names must not be reintroduced
  as compatibility aliases.
