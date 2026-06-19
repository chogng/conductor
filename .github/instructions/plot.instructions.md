---
description: Plot service — drawing-domain consumer of session curves/metrics, plot settings, domains, downsampling, render models, and shared models for chart/thumbnail/export. Use when working under `src/cs/workbench/services/plot` or plot rendering helpers.
applyTo: 'src/cs/workbench/services/plot/**,src/cs/workbench/contrib/plot/**'
---
# Plot

Plot is the drawing core. Chart is only a host that renders plot output.

`IPlotService` subscribes to session and produces plot render models for Chart, Thumbnail, Search, and Export.

## Ownership

`IPlotService` owns:

- active plot type, such as IV/CV/CF/PV/IT/derived views;
- visible/hidden plotted series;
- axis unit conversion settings;
- y-scale mode for plotted data;
- plot domains and tick model;
- display downsampling;
- render model assembly from session curves/metrics;
- plot labels and legend labels that are display semantics.

It consumes:

- `SessionSnapshot` curves, metrics, series, file semantics;
- `IParametersService` or metric records when overlays depend on metrics;
- explicit user display settings.

It does not own:

- DOM rendering;
- chart panel layout;
- raw table parsing;
- assessment;
- template execution;
- thumbnail bitmap cache.

## Core files

| File | Responsibility |
| --- | --- |
| `src/cs/workbench/services/plot/common/plot.ts` | Defines `IPlotService`, `PlotType`, `PlotState`, `PlotRenderModel`, `PlotModelRef`, service events. `PlotType` is the plot-owned display alias for calculation kinds. |
| `src/cs/workbench/services/plot/common/plotModel.ts` | Shared model types: series, point, domain, axis labels, overlays. No DOM. |
| `src/cs/workbench/services/plot/common/plotSettings.ts` | Unit, scale, visibility, plot type settings. |
| `src/cs/workbench/services/plot/browser/plotService.ts` | Subscribes to session, maintains plot state, builds and caches plot render models. |
| `src/cs/workbench/services/plot/browser/plotCalculatedDataWorker.ts` | Browser worker entry that builds calculated plot data for queued prefetch work off the renderer UI thread. |
| `src/cs/workbench/services/plot/browser/plotCalculatedDataWorkerClient.ts` | Plot-owned worker adapter for async calculated-data and display-model prefetch requests, interactive/background worker lane reuse, timeouts, and fallback. |
| `src/cs/workbench/services/plot/browser/plotDisplayModel.ts` | Pure display-model builder shared by PlotService and the Plot worker. No DOM. |
| `src/cs/workbench/services/plot/browser/plotRenderModel.ts` | Converts session curves/metrics to normalized render model. Target home for current `plotMainRenderModel`. |
| `src/cs/workbench/services/plot/browser/plotViewModel.ts` | Domains, ticks, point model, downsampling, signed-log helpers. Target home for current plot view-model math. |
| `src/cs/workbench/services/plot/browser/plot.contribution.ts` | Registers `IPlotService` and session subscription. |
| `src/cs/workbench/contrib/plot/browser/plotMainView.ts` | DOM adapter from `PlotRenderModel` to chart canvas/SVG component props. No session reads. |
| `src/cs/workbench/contrib/plot/browser/plotMainChart.ts` | Low-level chart drawing widget. Receives props only. |

## Flow

```mermaid
flowchart TD
    Session[SessionSnapshot] --> PlotService[IPlotService]
    ChartActive[Chart active file] --> PlotService
    HoverPreview[Hover thumbnail file] --> PlotService
    RecentTargets[Recent active/hover chart targets] --> PlotService
    ThumbnailRange[Thumbnail-layout visible/nearby file ids] --> PlotService
    PlotService --> State[PlotState]
    PlotService --> Queue[Priority prefetch queue]
    Queue --> Worker[Plot worker]
    Worker --> Cache[CalculatedData cache]
    Worker --> ChartDisplay[Main chart PlotDisplayModel]
    ChartDisplay --> DisplayCache[PlotDisplayModel cache]
    Worker --> InspectorDisplay[Inspector PlotPaneDisplayModel]
    InspectorDisplay --> InspectorCache[Inspector display cache]
    PlotService --> Cache[CalculatedData cache]
    Cache --> DisplayCache
    DisplayCache --> Model[PlotRenderModel]
    PlotService --> Model[PlotRenderModel]
    Model --> Chart[IChartService]
    Model --> Thumbnail[IThumbnailService]
    Model --> Export[IExportService]
    Model --> Search[ISearchService]
```

## Public interface shape

```ts
export interface IPlotService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeCalculatedDataCache: Event<PlotCalculatedDataCacheChangeEvent>;
  readonly onDidChangePlotDisplayModelCache: Event<PlotDisplayModelCacheChangeEvent>;
  readonly onDidChangePlotState: Event<PlotState>;

  getState(): PlotState;
  getCachedCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null;
  getCachedPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null;
  getCachedPlotInspectorDisplayModel(input: PlotDisplayModelInput): PlotPaneDisplayModel | null;
  getCachedPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null;
  getCalculatedData(input: PlotCalculatedDataInput): CalculatedData | null;
  getLegendLabels(fileId: FileId): Readonly<Record<SeriesId, string>>;
  getPlotDisplayModel(input: PlotDisplayModelInput): PlotDisplayModel | null;
  getPlotLegendModel(input: PlotCalculatedDataInput): PlotLegendModel | null;
  getPlotMainRenderModel(input: PlotMainRenderModelInput): PlotMainRenderModel | null;
  prefetchCalculatedData(fileIds: readonly FileId[], priority: PlotCalculatedDataPrefetchPriority, plotType?: PlotType): void;
  prefetchPlotInspectorDisplayModel(input: PlotDisplayModelInput, priority: PlotCalculatedDataPrefetchPriority): void;
  prefetchPlotDisplayModel(input: PlotDisplayModelInput, priority: PlotCalculatedDataPrefetchPriority): void;
  prefetchPlotDisplayModels(inputs: readonly PlotDisplayModelInput[], priority: PlotCalculatedDataPrefetchPriority): void;
  setActivePlotType(plotType: PlotType): void;
  setAxisTitleOverride(context: PlotAxisTitleContext, title: string, defaultTitle: string): void;
  setAxisUnit(fileId: FileId, axis: 'x' | 'y', unit: XUnit | YUnit): Promise<void>;
  setLegendLabel(fileId: FileId, seriesId: SeriesId, label: string | null): void;
  setYScale(fileId: FileId, scale: 'linear' | 'log'): Promise<void>;
}
```

`setAxisUnit` and `setYScale` are Plot owner APIs. Their persistent backing is
platform `IStorageService`, because per-file unit and scale choices are
remembered plot state, not user configuration. `PlotService` writes storage and
then fires `onDidChangePlotState`. Chart views must call Plot, not settings or
storage, for these controls.

## Rules

- Plot reads session curves; Chart does not.
- Plot owns data-to-display transformation.
- Plot calculated-data prefetch is a cache warmup queue only; it must not own
  Chart or Thumbnail rendering, and it must not publish a fake state change.
- Queued Plot calculated-data prefetch should run DOM-independent calculation
  through `plotCalculatedDataWorker` when Worker is available. `PlotService`
  remains the owner that accepts fresh results, writes the cache, ignores stale
  results, and falls back only when the worker path is unavailable or fails.
- Plot worker calculated-data requests should send only the file fields needed
  for plot calculation, such as base curves, series labels/order, and latest
  template axis metadata. Do not post full raw table row stores to the worker.
- Plot worker client should reuse bounded interactive/background lanes instead
  of creating a fresh worker for each prefetch request. Background work remains
  serialized on the background lane; active and hover work may use the
  interactive lane so foreground requests can still run while background
  warmup is in progress.
- `getCachedCalculatedData` is a non-creating read for consumers that must not
  run calculation work in their own frame budget.
- `getCachedPlotDisplayModel` and `getCachedPlotLegendModel` are non-creating
  reads for active chart rendering. Chart views should call them and request
  active prefetch on cache miss instead of synchronously creating calculated
  data during render.
- Plot publishes `onDidChangeCalculatedDataCache` when a calculated-data cache
  entry is created or invalidated for a specific file/plot pair, so consumers
  can refresh loading UI without polling or reacting to unrelated files.
- Plot calculated-data prefetch skips entries that are already cached for the
  same file id and plot type; it must not spend frame budget on warmed data.
- Plot calculated-data prefetch priority follows the user-facing surface:
  active chart file, hover thumbnail, visible thumbnails, recent interactive
  chart targets, nearby thumbnails, idle.
- Plot prefetch scheduling must reserve interactive capacity. Visible/recent/nearby/idle
  background work must not occupy every worker slot; active chart and hover work
  must be able to start while background prefetch is still running.
- Queued calculated-data prefetch must be canceled when the active plot type
  changes. Plot-relevant session changes must invalidate only the affected
  file ids when the event provides them; unrelated file commits must not cancel
  the active chart or hover prefetch and must not publish a global
  `onDidChangePlotState`.
- Plot display-model prefetch is a separate cache warmup. `getCachedPlotDisplayModel`
  must not build display models synchronously when only calculated data is warm.
- `prefetchPlotDisplayModels` is the owner API for batch chart display warmup.
  It must dedupe targets, skip chart display cache hits, promote queued or
  in-flight requests, request missing calculated data, and publish aggregate
  perf counters from PlotService. Callers that only know a target list must not
  reimplement Plot cache or queue filtering.
- Queued Plot display-model prefetch should run DOM-independent render-model,
  legend-filter, unit, and inspector derivative assembly through the Plot worker
  when Worker is available. `PlotService` accepts fresh results, writes the
  display-model cache, ignores stale results, and falls back only from the
  scheduled prefetch path.
- Plot display-model prefetch is split by pane. Main chart work publishes a
  chart-only `PlotDisplayModel` so Chart can paint the main canvas. Inspector
  derivative work is requested through `prefetchPlotInspectorDisplayModel` and
  cached separately as a `PlotPaneDisplayModel`. Inspector readiness must not
  replace the main chart display cache entry.
- Inspector display-model prefetch is active chart detail completion work, not
  thumbnail first-paint work. Inspector work should run at background priority
  and must not occupy the reserved interactive capacity needed by active chart,
  file switch, or hover thumbnail requests. Hover, visible, recent, nearby, and idle
  thumbnail warmup should keep chart-only display models and must not request
  inspector models.
- Chart should request Inspector display-model prefetch only after the active
  chart target has settled. Plot accepts Inspector prefetch as secondary pane
  completion and caches it separately; stale rapid-switch targets should be
  canceled by the Chart host before they enter the Plot queue.
- Active and hover display-model prefetch may synchronously cache the cheap
  chart-only display model when calculated data is already warm. This gives
  Chart and hover thumbnails a first drawable frame without waiting behind
  background worker display-model work; only Chart's visible Inspector pane
  should request the inspector model afterward.
- Active and hover display-model prefetch may also synchronously warm the
  calculated-data cache for only the requested file when the session already has
  drawable canonical curves. Keep this interactive warm path file-scoped and do
  not apply it to visible/nearby/idle background prefetch.
- Plot display-model cache invalidation is file-scoped. When a session event
  affects only specific file ids, `PlotService` should publish targeted
  `onDidChangePlotDisplayModelCache` events for those file/plot pairs instead
  of waking every Chart/Thumbnail consumer through `onDidChangePlotState`.
- Plot display-model cache is bounded by `PlotService` and should use
  tiered recent-use eviction. Active, hover, visible, and recent display targets
  should be retained ahead of nearby/idle background warmup; within the same
  retention tier, evict the least recently used entry. Use a soft limit for
  nearby/idle background warmup and a higher hard cap for interactive targets;
  crossing the soft limit must first shed background entries and should only
  evict active/hover/visible/recent entries when the hard cap is exceeded.
  Eviction is cache lifecycle only and should be silent; data-change
  invalidation remains the path that publishes `onDidChangePlotDisplayModelCache`.
  Cached reads for active chart, hover thumbnail, file switching, and recent
  interaction backfill should refresh recency and may promote retention so
  interactive targets survive background warmup pressure.
- Plot render models are currently built from template/base curve records and
  Plot-owned settings. `calculatedRecordsChanged`, `metricsChanged`, and
  derived-only `curvesChanged` events must not invalidate active chart or hover
  thumbnail plot caches unless Plot starts consuming those canonical records as
  render inputs.
- Chart views should request `prefetchPlotDisplayModel(..., "active")` on a
  cached display-model miss. They should not call `getPlotDisplayModel` in the
  active render path.
- Domain bridges that know active, hover, visible, recent, or nearby chart targets
  should call `prefetchPlotDisplayModel` for a single target or
  `prefetchPlotDisplayModels` for a target set. PlotService owns the decision
  to warm calculated data, skip cached display models, or promote queued work.
  Visible and nearby thumbnail backfill should be requested only while Explorer
  is in chart thumbnail layout; tree-layout hover previews use hover priority
  on demand.
- When the workbench is already in Chart mode, DomainBridge may also prewarm
  chart-only display models for Explorer hover, recent, visible, and nearby
  chart file targets. This is a cache warmup for rapid active-file switching;
  it should use Plot's existing priority levels (`hover`, `recent`, `visible`,
  `nearby`) and must not request Inspector display models or mutate Chart-owned
  state.
- Plot render models must be stable and reusable by Chart/Thumbnail/Export.
- Chart canvas drawing should use a display downsample budget tied to the
  visible pixel width. Full point arrays remain in the render model for readout
  accuracy, but the first paint must not synchronously draw every point in a
  large series.
- `PlotMainChart` may stamp a host-provided render signature on the canvas and
  emit a draw perf event for diagnostics. The signature must come from the
  consuming host's Plot display model identity; the chart widget must not read
  Session or invent data ownership to create it.
- `PlotMainChart` defaults to stable layout draw, but active Chart hosts may
  request an eager first draw once the chart is connected and sized. Keep this
  as an explicit host-provided strategy so reusable plot surfaces do not
  accidentally trade layout stability for speed.
- For eager active Chart hosts, `PlotMainChart.update(...)` may draw
  synchronously when the existing chart is connected and already has a readable
  layout size. This avoids adding a frame of latency to active file switches;
  reusable stable surfaces should continue to use the scheduled stable draw
  path.
- `PlotMainChart` should preserve the canvas backing store across redraws when
  CSS size and device pixel ratio are unchanged. Redraw should clear the
  existing canvas, not reset `canvas.width`/`canvas.height`, unless the backing
  size actually changes.
- `PlotMainChart` is a long-lived DOM widget. Hosts should call its update path
  with new props when only render data, axis labels, settings, or callbacks
  change; do not replace the canvas unless the host itself changes structural
  mode or disposes the plot surface.
- Plot state is display state; do not store it in Session unless it becomes saved project state later.

## Command entry and dispatch

Plot owns commands that change plotted data presentation.

Recommended files:

| File | Responsibility |
| --- | --- |
| `src/cs/workbench/contrib/plot/browser/plotCommands.ts` | Registers plot type, unit, scale, visibility, and active series commands. |
| `src/cs/workbench/contrib/plot/browser/plotActions.ts` | Toolbar/menu/keybinding entries for plot commands. |
| `src/cs/workbench/services/plot/browser/plotService.ts` | Owns plot state and render-model generation. No command registration. |

Command flow:

```txt
plot.setActivePlotType command
  -> IPlotService.setActivePlotType(type)
  -> IPlotService.onDidChangePlotState
  -> Chart/Thumbnail/Export/Search consumers update
```

Chart UI may expose buttons for these commands, but the target service remains `IPlotService`.

## Do not

- Do not put canvas/SVG DOM code in PlotService.
- Do not let Chart rebuild curve domains from raw session records.
- Do not duplicate downsampling logic in Thumbnail.
- Do not compute assessment or template outputs here.


## Field catalog

Use `records.instructions.md` for plot state and render-model field
definitions: `PlotState`, `PlotRenderModel`, `PlotSeriesModel`, and
`PlotAxisModel`.

Per-file unit and scale choices are written through Plot owner APIs and
persisted in platform storage. `PlotService` consumes storage, legacy Settings
values, and Session when building display models; callers do not pass axis
settings through Chart input or render-model requests.

## Component split

| Component | Responsibility |
| --- | --- |
| `PlotService` | Owns `PlotState`, subscribes to session, publishes render models. |
| `plotRenderModel.ts` | Pure render-model builders from session curves + plot state to `PlotRenderModel`. |
| `plotViewModel.ts` | Pure domain, tick, point-model, downsampling, and signed-log calculations. |

Do not make Chart own these fields. Chart consumes them.
