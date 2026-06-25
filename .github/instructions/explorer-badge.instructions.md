---
description: Explorer badge projection rules for pending decorations, table-model queue progress, Review/Slice confirmation, visible-first scheduling, stale result protection, and row reuse.
applyTo: 'src/cs/workbench/contrib/files/**,src/cs/workbench/services/tableModel/**,src/cs/workbench/browser/workbenchDomainBridge.ts'
---
# Explorer Badge Projection

Explorer badges are Files Explorer UI decorations. They are not canonical
Session records and must not become converter, table-model, review, slice,
template, chart, or table decision inputs.

## Ownership

Pending badge:

- Explorer projection only;
- first-frame display and stable badge slot layout;
- may show pending source status or TableModel queue progress only;
- must not infer semantic labels from file name, path, extension, sheet name, header rows, or source rows;
- must not read files, write Session, alter converter output, select templates, or drive table/chart decisions.

Confirmed badge:

- comes from formal Review/Slice/processed projections committed through Session;
- is the final Explorer semantic badge projection;
- represents reviewed template readiness, slice progress, executed curve type, or final unavailable/error state.

## State Flow

```txt
pending -> review/slice projection
pending -> table-model queue progress
table-model queue progress -> review/slice projection
pending -> error
```

Formal Review/Slice projection always wins. If Review cannot provide a ready
template or Slice reports a terminal failure, Explorer must not keep showing a
semantic badge from earlier table-model progress.

## Scheduling

Explorer reports actual rendered range from ObjectTree/List. Do not calculate
"first page" from density or row height.

```txt
visible rows   -> table-model priority visible
overscan rows  -> table-model priority nearby
remaining rows -> table-model priority background
table-model queue state -> WorkbenchDomainBridge -> ExplorerFileEntry.badgeState
```

Table-model queue entries dedupe by raw table identity and source version. Drop
stale queued results if the raw table version changes.

## Rendering

Every file row renders a stable badge slot in the first frame. Row layout must
not wait for full table-model, Review, or Slice production.

Virtualized rows are reusable DOM. Bind badge updates to the current row key
before writing text, state, title, or classes. Repeated renders with the same
badge key should not rewrite DOM.
