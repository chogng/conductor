---
description: Origin Export service - Origin/CSV export plan construction from session records and plot models.
applyTo: 'src/cs/workbench/services/export/**,src/cs/workbench/contrib/export/**,src/cs/workbench/contrib/origin/**'
---
# Origin Export

Export builds export plans and payloads. It is not Chart and not Plot.

## Ownership

`IExportService` owns:

- export option state, scope, and selected content keys;
- Origin/CSV payload planning and validation;
- mapping Session/Plot/Parameters data into export payloads;
- open-in-Origin, ZIP export, and user-facing export errors.

It consumes Session snapshots, Plot display models, Settings export options,
Parameters output when selected, and platform file/dialog services. It does not
own chart rendering, plot domain calculation, table-model production, template
execution, or canonical Session mutation.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/export.ts` | service contract, scopes/options, plan/payload types. |
| `common/originExport.ts` | Origin payload and content key types. |
| `browser/exportService.ts` | option state, plan building, validation. |
| `browser/originExportService.ts` | Origin bridge and side effects. |
| `browser/csvExportService.ts` | CSV/export file generation. |
| `contrib/export/browser/exportViewPane.ts` | UI shell that renders and invokes `IExportService`. |

## Flow

```txt
Export UI / command
  -> IExportService
  -> Session + Plot + Parameters + Settings owner APIs
  -> ExportPlan
  -> Origin / ZIP / CSV side effect
```

## Rules

- Use Plot models for display-oriented export.
- Use Session records for canonical data-oriented export.
- Export option state is service-local unless saved project export settings are intentionally introduced.
- Workbench may sync current selection/snapshot into Export state, but export execution rereads owner APIs.
- Notification/toast side effects belong to export/origin execution, not Workbench callback bags.

## Field Catalog

Use `records.instructions.md` for `ExportState` and `ExportPlan`.

## Do Not

- Do not read `ChartViewPane` state to export data.
- Do not recompute plot domains independently from Plot.
- Do not mutate curves or metrics during export.
- Do not put export option state in Session.
