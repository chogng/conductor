---
description: Template service - template CRUD, application workflow, run records, worker boundary, and conversion from assessment blocks to series/curves.
applyTo: 'src/cs/workbench/services/template/**,src/cs/workbench/contrib/template/**'
---
# Template

Template consumes assessment. It does not decide whether a table is
IV/CV/CF/PV/IT.

## Ownership

`ITemplateService` owns template CRUD, the cached template list and list
events, selection rules, form state, per-file template selections, and template
view input.

`ITemplateStoreService` owns template persistence backend access. Desktop
`template.json` persistence uses platform file service and
`IJSONEditingService`; Electron main only exposes generic file capability.

`ITemplateApplyWorkflowService` owns planning, apply progress, per-file apply
state, queue prioritization, applying templates to raw files/assessment blocks,
and committing template outputs through Session.

`ITemplateApplyService` owns worker/backend job start/cancel/terminate and
worker payload/result translation.

Template does not own assessment, raw import, table selection state, plot
rendering, or chart state.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/template.ts` | service contract, `TemplateRecord`, `TemplateConfig`, CRUD contracts. |
| `common/templateStore.ts` | persistence backend contract and data normalization. |
| `common/templateRun.ts` | run records, inputs, warnings/errors, config fingerprint. |
| `common/templateSelection.ts` | selection records/helpers. |
| `browser/templateService.ts` | CRUD, selection state, read APIs. |
| `browser/templateStoreService.ts` / `electron-browser/templateStoreService.ts` | browser fallback and desktop persistence. |
| `browser/templateApplyService.ts` | worker/backend boundary. |
| `browser/templateApplyPlanner.ts` | pure plan from config + assessment blocks. |
| `browser/templateApplyController.ts` | workflow service/controller: apply, progress, batching. |
| `contrib/template/browser/templateViewPane.ts` | UI shell; renders service state and sends commands. |

## Flow

```txt
SessionSnapshot + Template state + Explorer/chart active file
  -> TemplateApplyWorkflowInput
  -> TemplateApplyPlanner / per-file template selection routing
  -> assessment block bindings / auto extraction plan
  -> ITemplateApplyService worker/backend
  -> TemplateRunRecord + series + base curves + diagnostics
  -> ISessionService.commitTemplateOutputs(...)
  -> processing status and per-file state events
```

## Rules

- Template reads block source ranges and column maps from Assessment.
- Legacy raw-header auto-template inference is compatibility-only and lives
  outside Template; do not add new detection rules to Template apply workflow.
- Template may read current table selection through injected `ITableService` public APIs only as explicit user input.
- Do not pass `ITableService`, table row readers, or table model methods through Template view/workflow input.
- Template apply is an owner API on `ITemplateApplyWorkflowService`; UI invokes apply methods instead of receiving Workbench callbacks.
- WorkbenchDomainBridge may keep workflow input current by subscribing and rereading owner services.
- Per-file template selections belong to `ITemplateService`; apply workflow resolves them and may split one batch into auto and custom-template groups.
- Template list consumers must read `ITemplateService.getTemplateList()` and
  subscribe to `onDidChangeTemplateList`; they must not maintain a second
  template list cache in Explorer or Template UI.
- `activeFileId` should move the current chart/Explorer target to the front of full, incremental, and rule queues.
- `prioritizeProcessingFile(fileId)` is the owner API for interactive queue promotion from hover/selection signals.
- The workflow may retain a short latest-first priority lane, but Explorer/Chart/Thumbnail/Plot must not mutate template queues directly.
- Progress belongs to `ITemplateApplyWorkflowService`; consumers subscribe and reread `processingStatus`.
- Per-file readiness belongs to the workflow; Explorer projects it into badges/chart-state without adding/removing file tree items.
- Mark files `processing` when a single-file task starts, then `ready`, `failed`, or remove through the same owner state.
- Result records include config fingerprint and source block ids.
- Coalesce completed file outputs through `commitTemplateOutputs(...)` when possible.
- Skip missing, legacy curve-only, unknown, low-confidence, review-required, or
  `AssessmentDecision.autoApplyAllowed !== true` assessments by default. Auto
  and rule apply must also require Assessment blocks with usable X/Y bindings
  and canonical units; keep skipped files visible through Explorer badges.
- Full/incremental apply must not start while another extraction job is running or while Explorer has pending/preparing sources.
- Session cleanup: `filesRemoved` removes affected queued files; `sessionCleared` terminates and resets active processing.

## Commands

Template commands cover template management and application. Apply is a
workflow and may use a controller.

```txt
template.apply command
  -> ITemplateApplyWorkflowService
  -> ITemplateService / ITemplateApplyService
  -> assessment blocks from SessionSnapshot
  -> TemplateRunRecord + curves/series
  -> ISessionService commitTemplateOutputs
```

Commands/controllers must not re-detect table structure.

## Field Catalog

Use `records.instructions.md` for `TemplateRecord`, `TemplateConfig`,
`TemplateState`, `TemplateApplyWorkflowInput`, and `TemplateRunRecord`.

## Do Not

- Do not infer IV/CV/transfer/output from raw headers here.
- Do not store template form draft state in Session.
- Do not let worker payload format leak into Session records.
- Do not let TemplateView mutate Session directly.
- Do not route processing cleanup through Explorer submit events or Workbench-only callbacks.
