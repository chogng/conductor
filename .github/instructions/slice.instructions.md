---
description: Slice service - executes canonical Template snapshots into SliceRun, series, and base curves.
applyTo: 'src/cs/workbench/services/slice/**,src/cs/workbench/contrib/slice/**'
---
# Slice

Slice is the execution owner for concrete, already-selected `Template`
snapshots. It does not classify raw data and does not reinterpret rules.

## Ownership

`ISliceService` owns:

- per-file `TemplateSelection` for slicing;
- automatic slice queue entries from `Assessment.selectedTemplate`;
- manual slice requests with inline or saved templates;
- slice file state, priority, cancellation, and queue draining;
- calling the planner/executor and committing `SliceCommit` through Session.

`SlicePlanner` owns deterministic plan creation from immutable inputs:
`Template`, raw table dimensions, source versions, and Assessment-provided
measurement bindings. It must not read rows, start workers, or mutate Session.

`SliceExecutor` owns execution of a `SlicePlan` against supplied rows and
returns a `SliceCommit`. It must not call services or reread Session.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/slice.ts` | service contract, `SliceRun`, `SlicePlan`, commit/state/input types. |
| `common/slicePlanner.ts` | pure plan/range generation and assessment signature helpers. |
| `common/sliceExecutor.ts` | pure row execution into `SliceCommit`. |
| `browser/sliceService.ts` | injectable owner for queue, selection, progress state, row reading, and Session commit. |
| `browser/autoSlice.contribution.ts` | lifecycle subscriber from `assessmentChanged` to `ISliceService.enqueueAuto(...)`. |
| `browser/slicePriority.contribution.ts` | lifecycle subscriber from Explorer selection/hover facts to `ISliceService.prioritize(...)`. |
| `contrib/slice/browser/sliceCommands.ts` / `sliceActions.ts` | command/action entry for user-triggered slicing; normalizes targets and delegates to `ISliceService`. |

## Flow

```txt
Session assessmentChanged
  -> AutoSliceContribution rereads SessionSnapshot
  -> selectedTemplate + autoApplyAllowed + stale SliceRun check
  -> ISliceService.enqueueAuto(rawTableRefs)
  -> SliceService resolves Template snapshot / measurement binding
  -> SlicePlanner.createSlicePlan(...)
  -> SliceService verifies source version, assessment signature, and template fingerprint
  -> RawTableRowsReader reads rows
  -> SliceService verifies the same plan signatures again
  -> SliceExecutor.executeSlicePlan(...)
  -> ISessionService.commitSliceRuns(...)
  -> Session sliceRunChanged
```

Manual flow:

```txt
files.item.setTemplate command
  -> ISliceService.setTemplateSelection(fileId, selection)
  -> SliceState.templateSelectionsByFileId

command/action/controller
  -> ISliceService.runWithTemplate({ ref, selection })
  -> resolve inline/saved Template
  -> same planner/executor/commit path
```

Bulk command flow:

```txt
slice.runWithTemplate / slice.runWithTemplateIncremental command
  -> collect RawTableRef targets from SessionSnapshot
  -> resolve TemplateSelection from current Template owner state
  -> ISliceService.runWithTemplate(...) for each target
```

Priority flow:

```txt
Explorer selection / hover event
  -> SlicePriorityContribution
  -> ISliceService.prioritize(fileId)
```

Cleanup flow:

```txt
Session filesRemoved
  -> SliceService removes matching queue entries, file states, selections, active file

Session sessionCleared
  -> SliceService clears queue, file states, selections, active file
```

Explorer projection:

```txt
SliceState.fileStates
  -> WorkbenchDomainBridge / ExplorerPaneInput
  -> chartState + chartMessage
```

## Rules

- Slice consumes Assessment facts; it must not detect headers, roles, family, or
  mode from raw rows.
- Automatic mode executes `RawTableAssessmentRecord.selectedTemplate`.
- Manual mode may use an inline template or a saved template resolved through
  TemplateService; compatibility adapters may convert historical/manual presets into
  canonical `Template`.
- `Template` coordinates are raw-table relative. Runtime provenance belongs to
  `SlicePlan.inputRanges` and `SliceRun.inputRanges`.
- `commitSliceRuns(...)` is the Session boundary. Do not commit run, series, and
  curves through separate Session calls.
- Slice queue entries must be dropped as stale if their source raw table
  version, automatic assessment signature, or saved-template fingerprint changes
  before commit.
- Contributions only subscribe and delegate. They do not plan, execute, read
  rows, or commit Session.
- Slice commands may collect stable `RawTableRef` command targets from
  `SessionSnapshot`, but must not read rows, plan, execute, or commit Session.

## Do Not

- Do not make Rule JSON executable here.
- Do not re-run Assessment logic in Slice.
- Do not store Slice queue/progress in Session.
- Do not call or reintroduce a Template-owned apply workflow from Slice.
