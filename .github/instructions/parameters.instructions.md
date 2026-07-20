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

It resolves the selected metric-bearing `CalculationResourceResult` using
caller-provided resource identity and uses the Calculation input signature for
duplicate suppression. It does
not own metric algorithms unless explicitly split here later, raw parsing, plot
rendering, chart shell, another owner's state, or table selection.

## Core Files

| File | Responsibility |
| --- | --- |
| `common/parameters.ts` | service contract and view ids. |
| `common/parameterModel.ts` | pure display model types/builders. |
| `browser/parametersService.ts` | state owner and duplicate publish suppression. |
| `contrib/parameters/browser/parametersCommands.ts` | show/reveal/input commands. |
| `contrib/parameters/browser/parametersViewPane.ts` | view shell; forwards edits/selection. |
| `contrib/parameters/browser/parametersModel.ts` | transitional model; target owner is service model files. |

## Flow

```txt
show parameters command -> IWorkbenchLayoutService
current chart resource target -> IParametersService.updateViewState
IParametersService requests a missing Calculation result
Calculation result event -> resolve result + input signature
onDidChangeParametersViewState -> ParametersViewPane render
```

## Rules

- Selected rows, filters, method choices, and panel state are service-local.
- Parameter rows project Calculation curves/metrics by ids.
- `onDidChangeParametersViewState` is a leaf view event for Parameters views.
- Workbench provides the current chart resource target while rendering the active Parameters auxiliary view; Parameters resolves the backing result/signature through `ICalculationService`.
- `updateViewState` requests Calculation for a missing current target and suppresses duplicate publishes when the effective input is unchanged.
- Showing/hiding Parameters belongs to layout/view commands, not `IParametersService`.

## Do Not

- Do not store selected parameter row outside `IParametersService`.
- Do not compute plot domains here.
- Do not use raw table rows directly unless a parameter algorithm explicitly goes through calculation ownership.
- Do not have Workbench consume `onDidChangeParametersViewState` and call `updateViewState` in response.
