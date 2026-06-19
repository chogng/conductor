---
description: Chart service - chart shell, view hosting, chart pane state, and rendering Plot output.
applyTo: 'src/cs/workbench/services/chart/**,src/cs/workbench/contrib/chart/**'
---
# Chart

Chart is the rendering host for Plot. It is not the drawing-domain owner.

Put series data, domains, units, y-scale, plot type, visibility, and render
models in Plot. Put chart pane shell, detail panes, popovers, headers, and plot
view embedding in Chart.

## Ownership

`IChartService` owns:

- chart shell state and chart view input snapshot;
- detail pane visibility, including storage-backed restore of remembered app state;
- legend/inspector popover UI state;
- chart header action state;
- commands that affect chart shell UI.

It consumes `IPlotService` render/display models and plot state. It does not
own raw session data extraction, domains/ticks/downsampling, unit conversion,
raw curves/metrics, or thumbnail bitmap generation.

## Core Files

| File | Responsibility |
| --- | --- |
| `services/chart/common/chart.ts` | chart service contract, shell state, pane state, events, commands. |
| `services/chart/browser/chartService.ts` | chart shell state owner and view input publisher. |
| `contrib/chart/browser/chart.contribution.ts` | chart command/view contribution registration. |
| `contrib/chart/browser/chartViewPane.ts` | view pane shell; subscribes and rereads owner services. |
| `contrib/chart/browser/chartPanel.ts` | chart panel composition from props; no Session reads. |
| `contrib/chart/browser/chartActions.ts` | chart shell actions. |
| `contrib/chart/browser/chartTitleEditService.ts` | command-to-view workflow bridge for axis-title edit focus. |
| `contrib/chart/browser/chartFileSelect.ts` | file selector UI adapter. |

## Flow

```txt
IChartService ChartViewInput
  -> ChartViewPane
  -> IPlotService cached display/legend reads
  -> PlotMainView / ChartPanel
  -> canvas/widget rendering
```

## Boundary

Belongs to Plot:

- active plot type;
- x/y unit conversion;
- y-scale mode;
- series visibility/focus;
- axis domains/ticks;
- legend labels derived from series;
- plot display/render models.

Belongs to Chart:

- legend popover open/closed;
- inspector/detail pane visible/hidden;
- header action visibility;
- chart pane layout;
- focus/edit-title UI workflow.

## Command Dispatch

Chart commands own chart chrome, not plot data.

| Behavior | Owner |
| --- | --- |
| plot type / unit / scale / series visibility / legend label / axis title value | `IPlotService` |
| legend popover / inspector pane / chart focus | `IChartService` |
| axis-title edit focus | `IChartTitleEditService` -> registered `ChartViewPane` handler |
| chart file selection | `IExplorerService.select({ kind: "chart", fileId }, "force")` |

If a chart header button changes plot data presentation, it should execute a
Plot command, not a Chart command.

Do not pass Plot-owned behavior or Explorer selection callbacks through
`ChartViewInput`; `ChartViewPane` can call owner services directly.

## Render Rules

- `ChartViewPane` subscribes to Plot and rereads cached display, legend model, and legend labels from Plot.
- Do not pass Plot display/legend models through `ChartViewInput`.
- On cache miss, request `prefetchPlotDisplayModel(..., "active")` and render Chart-owned pending display for the active file.
- Pending display is visual state only; it is not a fake `PlotDisplayModel`.
- Replace pending display only with a matching real Plot display cache result.
- Main chart and inspector display models are staged. Render main chart immediately when chart display is ready, even if inspector is pending.
- Request inspector display-model prefetch only after the active file/plot/legend target has settled.
- When the inspector detail pane is visible, startup chart prewarm may request the initial active inspector display model alongside chart-main prefetch through Plot owner APIs.
- Later active file switches should keep inspector work on the settled detail-pane path instead of immediately warming every transient selection.
- Background visible, nearby, and recent chart prewarm paths should stay chart-main only unless they add an explicit budget; inspector display models are detail-pane work and should not churn the bounded inspector cache.
- Do not request inspector display-model prefetch while the inspector detail pane is hidden; restoring a hidden inspector pane should keep startup chart prefetch chart-only until the user opens the pane.
- When the inspector detail pane is hidden, cancel queued inspector prefetch work through Plot rather than leaving hidden-pane warmups in the queue.
- Rapid active file switches should cancel stale inspector prefetch before it reaches Plot.
- Active chart hosts may request eager first draw for the main chart pane; detail panes keep stable scheduled draw behavior.
- Keep chart-mode content mounted across active file switches when structural state remains chart data with cached display model.
- Rebuild only on structural mode changes: empty, processing, module-loading, or no cached display model.
- `ChartViewInput.processingStatus` is only for no-chart-data loading/empty state.
- When file selector is hidden and active chart has data, `chartFileOptions` should contain only the active option needed by the view.
- `onDidChangeChartViewInput` announces snapshot changes; panes must reread `IChartService.getViewInput()`.

## Workbench Refresh Rules

Explorer chart-file selection flows through Explorer -> WorkbenchDomainBridge ->
Chart input without forcing a full workbench shell refresh.

Session, Plot, Template, Settings, and Export changes should not trigger full
shell refreshes just to update Chart-adjacent auxiliary views. Use scoped
auxiliary-surface refreshes when possible; keep layout/navigation and active
auxiliary-view changes on the full shell path.

## Field Catalog

Use `records.instructions.md` for `ChartState` and `ChartViewInput`.
`ChartViewInput` may project Plot, Explorer, Settings, or processing facts for
rendering, but must not become a callback bag or Plot model data path.

## Do Not

- Do not read `SessionSnapshot.curvesByKey` from `ChartService`.
- Do not compute plot domains in chart files.
- Do not let Thumbnail import chart internals to draw mini-plots.
- Do not store chart shell UI state in Session.
- Do not publish `onDidRequest*` events from `IChartService`; use explicit workflow services for view-local focus/edit commands.
