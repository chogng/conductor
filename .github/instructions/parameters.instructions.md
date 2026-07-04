---
description: Parameters service - parameter display model, selected row/display state, and parameter view coordination.
applyTo: 'src/cs/workbench/services/parameters/**,src/cs/workbench/contrib/parameters/**'
---
# Parameters

Parameters consumes metrics and curves and provides a parameter display model.
Pure view state stays in Parameters.

## Ownership

`IParametersService` owns:

- parameter view state and selected row;
- rows grouped by file/series/metric;
- display filters and sorting.

It resolves the selected metric-bearing file record from the service model /
legacy Session ledger using caller-provided file identity, consumes Plot context
when needed, and uses the owner model version for duplicate suppression. It does
not own metric algorithms unless explicitly split here later, raw parsing, plot
rendering, chart shell, Session mutation, or table selection.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/parameters.ts` | service contract, view ids, command ids. |
| `common/parameterModel.ts` | pure display model types/builders. |
| `browser/parametersService.ts` | state owner and duplicate publish suppression. |
| `contrib/parameters/browser/parametersCommands.ts` | show/reveal/input commands. |
| `contrib/parameters/browser/parametersViewPane.ts` | view shell; forwards edits/selection. |
| `contrib/parameters/browser/parametersModel.ts` | transitional model; target owner is service model files. |

## Flow

```txt
show parameters command -> IWorkbenchLayoutService
current chart target -> IParametersService.updateViewState
IParametersService resolves Session file record or Slice resource result + model version
onDidChangeParametersViewState -> ParametersViewPane render
```

## Rules

- Selected rows, filters, method choices, and panel state are service-local.
- Parameter rows link to curves/metrics by ids, not copied data.
- `onDidChangeParametersViewState` is a leaf view event for Parameters views.
- Workbench provides the current chart target while rendering the active Parameters auxiliary view; Parameters resolves the backing record/version through its own service boundary.
- `updateViewState` should suppress duplicate publishes when effective input is unchanged.
- Showing/hiding Parameters belongs to layout/view commands, not `IParametersService`.

## Do Not

- Do not store selected parameter row in Session.
- Do not compute plot domains here.
- Do not use raw table rows directly unless a parameter algorithm explicitly goes through calculation ownership.
- Do not have Workbench consume `onDidChangeParametersViewState` and call `updateViewState` in response.
