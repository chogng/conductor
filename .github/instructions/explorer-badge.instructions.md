---
description: Explorer badge projection rules for fast first-frame decorations, table-fact confirmation, visible-first scheduling, stale result protection, and row reuse.
applyTo: 'src/cs/workbench/contrib/files/**,src/cs/workbench/services/tableFacts/**,src/cs/workbench/browser/workbenchDomainBridge.ts'
---
# Explorer Badge Projection

Explorer badges are Files Explorer UI decorations. They are not canonical
Session records and must not become converter, table-fact, review, slice,
template, chart, or table decision inputs.

## Ownership

Fast badge:

- Explorer projection only;
- first-frame display and stable badge slot layout;
- may use only cheap signals: file name, relative path, extension, sheet name, available header/sample rows;
- must not read files, write Session, alter converter output, select templates, or drive table/chart decisions;
- represented as `ExplorerBadgeState` with `source: "fast"` and `confidence: "tentative"`.

Full badge:

- comes from formal Review/Slice projections committed through Session;
- is the final Explorer badge projection;
- may override or clear any fast badge;
- represents review readiness, slice progress, or final unavailable/error state.

## State Flow

```txt
pending -> fast/tentative
pending -> review/slice projection
fast/tentative -> review/slice projection
pending/fast -> error
```

Formal Review/Slice projection always wins. If Review cannot provide a ready
template or Slice reports a terminal failure, Explorer must not keep showing a
fast badge as confirmed.

## Scheduling

Explorer reports actual rendered range from ObjectTree/List. Do not calculate
"first page" from density or row height.

```txt
visible rows   -> table-fact priority visible
overscan rows  -> table-fact priority nearby
remaining rows -> table-fact priority background
table-fact queue state -> WorkbenchDomainBridge -> ExplorerFileEntry.badgeState
```

Table-fact queue entries dedupe by raw table identity and source version. Drop
stale queued results if the raw table version changes.

## Rendering

Every file row renders a stable badge slot in the first frame. Row layout must
not wait for full table-fact production.

Virtualized rows are reusable DOM. Bind badge updates to the current row key
before writing text, state, title, or classes. Repeated renders with the same
badge key should not rewrite DOM.
