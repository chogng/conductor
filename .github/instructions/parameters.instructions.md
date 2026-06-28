---
description: Parameters service - parameter display model, metric selection, metric input state, and parameter view coordination.
applyTo: 'src/cs/workbench/services/parameters/**,src/cs/workbench/contrib/parameters/**'
---
# Parameters

Parameters consumes metrics and curves and provides a parameter display model.
It may commit metric inputs that affect calculation; pure view state stays in
Parameters.

## Ownership

`IParametersService` owns:

- parameter view state and selected row;
- rows grouped by file/series/metric;
- manual metric input draft state;
- metric input commands that commit to Session;
- display filters and sorting.

It consumes Session metrics/metric inputs, Plot context when needed, and
Session commit APIs for real metric inputs. It does not own metric algorithms
unless explicitly split here later, raw parsing, plot rendering, chart shell,
or table selection.

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
SessionSnapshot/current file -> IParametersService.updateViewState
onDidChangeParametersViewState -> ParametersViewPane render
manual metric input -> IParametersService -> ISessionService.setMetricInput
```

## Rules

- Calculation-affecting manual inputs are canonical and may be committed to Session.
- Selected rows, filters, method choices, and panel state are service-local.
- Parameter rows link to curves/metrics by ids, not copied data.
- `onDidChangeParametersViewState` is a leaf view event for Parameters views.
- Workbench may provide current file id and Session snapshot while rendering the active Parameters auxiliary view.
- `updateViewState` should suppress duplicate publishes when effective input is unchanged.
- Showing/hiding Parameters belongs to layout/view commands, not `IParametersService`.

## Do Not

- Do not store selected parameter row in Session.
- Do not compute plot domains here.
- Do not use raw table rows directly unless a parameter algorithm explicitly goes through calculation ownership.
- Do not have Workbench consume `onDidChangeParametersViewState` and call `updateViewState` in response.
