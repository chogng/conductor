---
description: Explorer badge projection rules for fast first-frame decorations, assessment confirmation, visible-first scheduling, stale result protection, and row reuse.
applyTo: 'src/cs/workbench/contrib/files/**,src/cs/workbench/services/assessment/**,src/cs/workbench/browser/workbenchDomainBridge.ts'
---
# Explorer Badge Projection

Explorer badges are Files Explorer UI decorations. They are not canonical
Session records and must not become converter, template, chart, table, or
assessment decision inputs.

## Ownership

Fast badge:

- Explorer projection only;
- first-frame display and stable badge slot layout;
- may use only cheap signals: file name, relative path, extension, sheet name, available header/sample rows;
- must not read files, write Session, alter converter output, select templates, or drive table/chart decisions;
- represented as `ExplorerBadgeState` with `source: "fast"` and `confidence: "tentative"`.

Full badge:

- comes from formal assessment results committed through Session;
- is the final Explorer badge fact;
- may override or clear any fast badge;
- represented as `source: "assessment"` with confirmed `ready` or final `unknown`.

## State Flow

```txt
pending -> fast/tentative
pending -> assessment ready/unknown
fast/tentative -> assessment ready/unknown
pending/fast -> error
```

Full assessment always wins. If assessment returns unknown, Explorer must not
keep showing a fast badge as confirmed.

## Scheduling

Explorer reports actual rendered range from ObjectTree/List. Do not calculate
"first page" from density or row height.

```txt
visible rows   -> assessment priority visible
overscan rows  -> assessment priority nearby
remaining rows -> assessment priority background
```

Assessment queue entries dedupe by raw table identity and source version. Drop
stale queued results if the raw table version changes.

## Rendering

Every file row renders a stable badge slot in the first frame. Row layout must
not wait for full assessment.

Virtualized rows are reusable DOM. Bind badge updates to the current row key
before writing text, state, title, or classes. Repeated renders with the same
badge key should not rewrite DOM.
