---
description: Explorer decoration rules for review badges, visible-first scheduling, stale result protection, and row reuse.
applyTo: 'src/cs/workbench/contrib/files/**,src/cs/workbench/services/review/**,src/cs/workbench/browser/workbenchDomainBridge.ts'
---
# Explorer Decorations

Explorer badges are Files Explorer UI decorations. They are not canonical
Session records and must not become converter, table-model, review, slice,
template, chart, or table decision inputs.

## Ownership

Pending badge:

- Explorer projection only;
- first-frame display and stable badge slot layout;
- may show pending source status or pending Review summary only;
- must not infer semantic labels from file name, path, extension, sheet name, header rows, or source rows;
- must not read files, write Session, alter converter output, select templates, or drive table/chart decisions.

Confirmed badge:

- comes from `IReviewService.getLatestReviewSummary({ resource, sheetId })`;
- is the final Explorer semantic badge projection;
- represents reviewed template readiness, stale review, manual-adjustment needs, or final invalid review state.
- is exposed to Explorer through `ExplorerDecorationsProvider` registered on `IDecorationsService`, not through `ExplorerFileEntry`.

## State Flow

```txt
ExplorerFileEntry resource + sheetId
  -> ExplorerDecorationsProvider.provideDecorations(resource)
  -> IReviewService.getLatestReviewSummary({ resource, sheetId })
  -> Explorer decoration data
  -> IDecorationsService cache / onDidChangeDecorations
  -> ResourceLabels fileDecorations for label color / tooltip
  -> ExplorerViewPane decorationsByFileKey for badge text
  -> ExplorerViewer decorationsByFileKey
  -> ExplorerBadgeNode

ExplorerFileEntry resource + sheetId
  -> ExplorerViewPane reviewSummariesByFileKey
  -> IReviewService.getLatestReviewSummary({ resource, sheetId })
  -> ExplorerViewer review hover content
```

Review is the source of semantic Explorer decorations. If Review cannot provide
a ready template, Explorer must not keep showing a semantic badge from earlier
table-model progress or row metadata.
Explorer rich hover reads the same review-owned `TableReviewSummary`; label
decorations own only short color/tooltip/strikethrough presentation.

## Scheduling

Explorer reports actual rendered range from ObjectTree/List. Do not calculate
"first page" from density or row height.

```txt
visible rows   -> table-model priority visible
overscan rows  -> table-model priority nearby
remaining rows -> table-model priority background
reviewChanged -> ExplorerDecorationsProvider.onDidChange -> IDecorationsService.onDidChangeDecorations -> ExplorerViewer rerender
```

Table-model queue entries dedupe by raw table identity and source version. Drop
stale queued results if the raw table version changes. Queue state must not be
projected into Explorer decoration records.

## Rendering

Every file row renders a stable badge slot in the first frame. Row layout must
not wait for full table-model, Review, or Slice production.

Virtualized rows are reusable DOM. Bind badge updates to the current row key
before writing text, state, title, or classes. Repeated renders with the same
badge key should not rewrite DOM.

Legacy `ExplorerFileEntry.badgeState` and `curveTypeBadgeLabel` are retired.
New Explorer decoration work must use provider output keyed by Explorer file
key, with Review summary as the semantic source.
