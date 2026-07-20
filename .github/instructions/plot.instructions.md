---
description: Plot service - drawing-domain consumer of Calculation results, plot settings, domains, downsampling, render models, and shared models for chart/thumbnail/export.
applyTo: 'src/cs/workbench/services/plot/**,src/cs/workbench/contrib/plot/**'
---
# Plot

Plot is the drawing core. Chart is a host that renders Plot output.

`IPlotService` consumes resource/sheet Calculation results and produces plot
render/display models for Chart, Thumbnail, Search, and Export.

## Ownership

`IPlotService` owns:

- active plot type and plot display state;
- visible/hidden/focused plotted series;
- axis unit conversion and y-scale settings;
- plot domains, ticks, display labels, legend labels;
- display downsampling;
- render/display model assembly from resource/sheet Calculation results;
- calculated-data and display-model caches/prefetch queues.

It does not own DOM rendering, chart panel layout, raw parsing, table-model
production, template execution, or thumbnail bitmap cache.

## Core Files

| File | Responsibility |
| --- | --- |
| `services/plot/common/plot.ts` | `IPlotService`, `PlotType`, state, events, inputs. |
| `services/plot/common/plotModel.ts` | shared model types. No DOM. |
| `services/plot/common/plotSettings.ts` | unit/scale/visibility/plot-type settings. |
| `services/plot/browser/plotService.ts` | state, Calculation subscription, cache, and prefetch owner. |
| `services/plot/browser/plotCalculatedDataWorker*.ts` | worker entry/client for async display-model work. |
| `services/plot/browser/plotDisplayModel.ts` | pure display-model builder. |
| `services/plot/browser/plotRenderModel.ts` | calculated data -> render model. |
| `services/plot/browser/plotViewModel.ts` | domains, ticks, downsampling, signed-log helpers. |
| `contrib/plot/browser/plotMainView.ts` | DOM adapter from Plot model to chart widget props. No domain-service reads. |
| `contrib/plot/browser/plotMainChart.ts` | low-level drawing widget; props only. |

## Flow

```txt
resource/sheet Calculation results + PlotState
  -> PlotService
  -> calculated-data cache / display-model cache / worker queues
  -> PlotRenderModel / PlotDisplayModel
  -> Chart / Thumbnail / Export / Search
```

## Public Shape

Plot owner APIs include:

- `getState()`;
- cached non-creating reads: `getCachedCalculatedData`, `getCachedPlotDisplayModel`, `getCachedPlotInspectorDisplayModel`, `getCachedPlotLegendModel`;
- creating reads where appropriate: `getCalculatedData`, `getPlotDisplayModel`, `getPlotLegendModel`, `getPlotMainRenderModel`;
- Plot-owned settings reads: `getAxisSettings`;
- legend state reads: `getHiddenLegendKeys`, `getLegendLabels`;
- prefetch APIs: chart display model, inspector display model, and batch display models;
- state mutations: `setActivePlotType`, `setAxisUnit`, `setYScale`, `setAxisTitleOverride`, `setLegendLabel`, `toggleHiddenLegendKey`.

`setAxisUnit` and `setYScale` are Plot owner APIs. Their persistence currently
uses platform storage; callers should not write settings/storage directly.

## Cache And Prefetch Rules

- `getCached*` APIs are non-creating reads for render paths with tight frame budgets.
- Consumers request prefetch on cache miss instead of synchronously creating expensive data in render.
- Display-model prefetch explicitly requests the backing Calculation result on cache miss; ordinary reads do not trigger Calculation.
- PlotService owns dedupe, cache-hit skip, queue promotion, stale-result checks, and perf counters.
- Consumers pass `resource` and optional `sheetId` directly into Plot read and
  prefetch APIs. Plot derives cache and state keys from that identity.
- Consumers that need Plot-owned axis/unit/scale settings call `getAxisSettings()`.
- Calculated/display reads resolve the current result through `ICalculationService`.
- Display-model worker requests send calculated data plus presentation inputs;
  they do not send source-domain records or raw table stores.
- Use bounded interactive/background worker lanes. Reserve interactive capacity for active chart and hover work.
- Prefetch priority follows user-facing urgency: active chart, hover thumbnail, visible thumbnails, recent interactive targets, nearby thumbnails, idle.
- Visible/nearby thumbnail backfill runs only while Explorer is in chart thumbnail layout.
- Tree-layout hover previews use hover priority on demand.
- Active/hover display-model prefetch may synchronously project cheap calculated data and display models when canonical curves are already drawable.
- Do not apply interactive sync warm paths to visible/nearby/idle background prefetch.

## Invalidation And Retention

- Calculation result changes should invalidate only affected resource/sheet identities when
  possible.
- Plot-relevant data changes publish targeted calculated/display cache events.
- Do not publish global `onDidChangePlotState` for unrelated file commits.
- Active plot type changes cancel queued calculated-data prefetch.
- Display-model cache is bounded with tiered recent-use eviction.
- Retain active, hover, visible, and recent targets ahead of nearby/idle warmup.
- Eviction is silent cache lifecycle; data-change invalidation publishes events.
- Cached reads for active chart, hover, file switch, and recent backfill refresh recency.

Plot render models consume resource/sheet Calculation results and Plot-owned settings.

## Chart And Widget Rules

- Chart views call cached display/legend APIs in render and request active prefetch on miss.
- Display-model reads and prefetches apply Plot-owned legend visibility and labels by default; consumers should omit those fields unless they intentionally need an explicit override.
- Chart should not call `getPlotDisplayModel` in active render.
- Chart may request inspector display-model prefetch only as secondary pane completion after the active chart target settles.
- Active inspector work stays secondary to main chart display and uses a separate detail lane so older background prefetches cannot starve it and later active data can still run; startup and bridge-level chart prewarm remain chart-main only, while inspector targets come from the settled visible detail-pane path after the pane is opened in the current run.
- Hidden inspector panes should not keep queued inspector prefetch work alive; consumers should call Plot's queued-inspector cancellation API when the Chart-owned pane visibility turns off.
- Plot render models are reusable by Chart, Thumbnail, Export, and Search.
- First paint uses a display downsample budget tied to visible pixel width.
- `PlotMainChart` may expose host-provided render signatures for diagnostics.
- Eager first draw is explicit host strategy; reusable surfaces default to stable scheduled draw.
- Preserve canvas backing store across redraws when CSS size and device pixel ratio are unchanged.
- Hosts update long-lived plot widgets with new props; do not replace canvas unless structural mode changes.

## Commands

Plot owns commands that change plotted data presentation: plot type, unit,
scale, visibility, axis titles, and legend labels. Chart UI may expose buttons
for these commands, but the target service remains `IPlotService`.

Recommended files:

| File | Responsibility |
| --- | --- |
| `contrib/plot/browser/plotCommands.ts` | plot command handlers |
| `contrib/plot/browser/plotActions.ts` | toolbar/menu/keybinding entries |
| `services/plot/browser/plotService.ts` | state and render-model owner; no command registration |

## Do Not

- Do not put canvas/SVG DOM code in `PlotService`.
- Do not let Chart rebuild curve domains from Calculation records.
- Do not duplicate downsampling logic in Thumbnail.
- Do not compute table model or template outputs in Plot.
- Do not store Plot display state outside `IPlotService` unless it becomes saved project state.
