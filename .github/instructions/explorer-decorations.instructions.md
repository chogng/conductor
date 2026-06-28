---
description: Explorer decoration rules for Review summaries, visible-first scheduling, stale result protection, and row reuse.
applyTo: 'src/cs/workbench/contrib/files/**,src/cs/workbench/services/review/**,src/cs/workbench/browser/workbenchDomainBridge.ts'
---
# Explorer Decorations

Explorer decorations are Files Explorer presentation state. They are not canonical
Session records and must not become converter, table-model, review, slice,
template, chart, or table decision inputs.

Use "badge" only when describing the visual badge slot or user-facing badge
settings. Owner files, providers, and semantic flow should use decoration
terminology.

## Ownership

Pending decoration:

- Explorer UI only;
- first-frame display and stable visual slot layout;
- may show pending source status or pending Review summary only;
- must not infer semantic labels from file name, path, extension, sheet name, header rows, or source rows;
- must not read files, write Session, alter converter output, select templates, or drive table/chart decisions.

Confirmed decoration:

- comes from `IReviewService.getLatestReviewSummary({ resource, sheetId })`;
- is the final Explorer semantic decoration display;
- may show review-owned semantic summary fields such as curve kind, family,
  role, confidence, message, and stale/invalid state;
- represents reviewed template readiness, stale review, manual-adjustment needs, or final invalid review state.
- is exposed to Explorer through `ExplorerDecorationsProvider` registered on `IDecorationsService`, not through `ExplorerFileEntry`.
- must not read or subscribe to `ReviewEvidence`; Explorer consumes
  `ReviewSummary` only.

## State Flow

```txt
ExplorerFileEntry resource + sheetId
  -> ExplorerDecorationsProvider.provideDecorations(resource)
  -> IReviewService.getLatestReviewSummary({ resource, sheetId }) side-effect-free cache read
  -> Explorer decoration data
  -> IDecorationsService cache / onDidChangeDecorations
  -> ResourceLabels fileDecorations for label color / tooltip
  -> ExplorerViewPane decorationsByFileKey for badge text
  -> ExplorerViewer decorationsByFileKey
  -> ExplorerBadgeNode

ExplorerFileEntry resource + sheetId
  -> ExplorerViewPane reviewSummariesByFileKey
  -> IReviewService.getLatestReviewSummary({ resource, sheetId }) side-effect-free cache read
  -> ExplorerViewer review hover content
```

Review is the source of semantic Explorer decorations. If Review cannot provide
a ready template, Explorer must not keep showing a semantic decoration from earlier
content/materialization progress or row metadata.
Explorer rich hover reads the same review-owned `ReviewSummary`; label
decorations own only short color/tooltip/strikethrough presentation.

## Scheduling

Explorer reports actual rendered range from ObjectTree/List. Do not calculate
"first page" from density or row height.

```txt
visible rows   -> table-model priority visible
overscan rows  -> table-model priority nearby
remaining rows -> table-model priority background
reviewChanged -> ExplorerDecorationsProvider review scheduler -> provider.onDidChange(resources)
  -> IDecorationsService change scheduler -> onDidChangeDecorations -> ExplorerViewer rerender
```

Review summary reads from Explorer must not start structured-content resolution
or enqueue Review work. Explicit Review execution work dedupes by URI content
target plus contentHash/sourceVersion, evidence fingerprint, and optional
materialization version. Drop stale active results if the content target,
evidence snapshot, or materialization snapshot changes. Active Review state must
not be written into Explorer decoration state.

## Rendering

Every file row renders a stable badge slot in the first frame. Row layout must
not wait for full table-model, Review, or Slice production.

Virtualized rows are reusable DOM. Bind badge updates to the current row key
before writing text, state, title, or classes. Repeated renders with the same
badge key should not rewrite DOM.

Explorer decoration work uses provider output keyed by Explorer file key, with
Review summary as the semantic source.
