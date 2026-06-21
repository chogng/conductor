import {
  readNumber,
  summaryCount,
  summaryP95,
  summarizeDurations,
  summarizeStageDuration,
} from "./common.mjs";

export const tablePerformanceStages = [
  "table.layout",
  "table.widget.render",
  "table.renderTable",
  "table.rows.ensure",
  "table.rows.sync",
  "table.selection.sync",
  "table.scroll",
  "table.columnWidth.set",
];

export const summarizeTablePerformanceReport = (performanceTraceReport) => {
  const events = getPerformanceTraceEvents(performanceTraceReport)
    .filter(event => String(event.stage ?? "").startsWith("table."));
  const stages = {};
  for (const stage of tablePerformanceStages) {
    stages[stage] = summarizeTableStage(events, stage);
  }
  const allDurations = events.map(event => readNumber(event.meta?.durationMs));
  return {
    eventCount: events.length,
    stages,
    total: summarizeDurations(allDurations),
  };
};

export const createTablePerformanceReportBlock = ({
  performanceTraceReport,
  tableInteraction,
}) => ({
  ...summarizeTablePerformanceReport(performanceTraceReport),
  interaction: summarizeTableInteraction(tableInteraction),
});

const summarizeTableInteraction = (tableInteraction) => {
  if (!tableInteraction) {
    return null;
  }

  return {
    finalState: summarizeTableInteractionState(tableInteraction.finalState),
    initialState: summarizeTableInteractionState(tableInteraction.initialState),
    resize: {
      requestedCount: readNumber(tableInteraction.resize?.requestedCount) ?? 0,
      resizedCount: readNumber(tableInteraction.resize?.resizedCount) ?? 0,
    },
    scroll: {
      changedCount: readNumber(tableInteraction.scroll?.changedCount) ?? 0,
      requestedCount: readNumber(tableInteraction.scroll?.requestedCount) ?? 0,
    },
    selection: {
      didSelect: tableInteraction.selection?.didSelect === true,
      requestedCount: readNumber(tableInteraction.selection?.requestedCount) ?? 0,
      selectedCount: readNumber(tableInteraction.selection?.selectedCount) ?? 0,
      visibleColumnCount: readNumber(tableInteraction.selection?.visibleColumnCount),
      visibleRowCount: readNumber(tableInteraction.selection?.visibleRowCount),
    },
  };
};

const summarizeTableInteractionState = (state) => {
  if (!state) {
    return null;
  }

  return {
    bodyCellCount: readNumber(state.bodyCellCount),
    headerCellCount: readNumber(state.headerCellCount),
    resizeHandleCount: readNumber(state.resizeHandleCount),
    viewport: state.viewport,
  };
};

const summarizeTableStage = (events, stage) => {
  const stageEvents = events.filter(event => event.stage === stage);
  const duration = summarizeStageDuration(events, stage);
  return {
    ...duration,
    bodyCellRenderCount: sumStageMeta(stageEvents, "bodyCellRenderCount"),
    changedCount: countStageMeta(stageEvents, "changed", true),
    gridChangedCount: countStageMeta(stageEvents, "gridChanged", true),
    headerCellRenderCount: sumStageMeta(stageEvents, "headerCellRenderCount"),
    laidOutCount: countStageMeta(stageEvents, "laidOut", true),
    maxVisibleColumns: maxStageMeta(stageEvents, "visibleColumns"),
    maxVisibleRows: maxStageMeta(stageEvents, "visibleRows"),
    renderedTableCount: countStageMeta(stageEvents, "renderedTable", true),
    secondLayoutCount: countStageMeta(stageEvents, "secondLayout", true),
    touchedCellCount: sumStageMeta(stageEvents, "touchedCellCount"),
  };
};

export const createTablePerformanceMetrics = (performanceTraceReport) => {
  const summary = summarizeTablePerformanceReport(performanceTraceReport);
  const renderTable = summary.stages["table.renderTable"];
  const widgetRender = summary.stages["table.widget.render"];
  const layout = summary.stages["table.layout"];
  const rowsEnsure = summary.stages["table.rows.ensure"];
  const rowsSync = summary.stages["table.rows.sync"];
  const selectionSync = summary.stages["table.selection.sync"];
  const scroll = summary.stages["table.scroll"];
  const columnWidthSet = summary.stages["table.columnWidth.set"];
  return {
    tableBodyCellRenderCount: readNumber(renderTable?.bodyCellRenderCount) ?? 0,
    tableColumnWidthChangedCount: readNumber(columnWidthSet?.changedCount) ?? 0,
    tableColumnWidthSetCount: summaryCount(columnWidthSet),
    tableColumnWidthSetMaxMs: readNumber(columnWidthSet?.maxMs),
    tableColumnWidthSetP95Ms: summaryP95(columnWidthSet),
    tableHeaderCellRenderCount: readNumber(renderTable?.headerCellRenderCount) ?? 0,
    tableLayoutCount: summaryCount(layout),
    tableLayoutP95Ms: summaryP95(layout),
    tableMaxVisibleColumns: readNumber(renderTable?.maxVisibleColumns),
    tableMaxVisibleRows: readNumber(renderTable?.maxVisibleRows),
    tableRenderTableCount: summaryCount(renderTable),
    tableRenderTableMaxMs: readNumber(renderTable?.maxMs),
    tableRenderTableP95Ms: summaryP95(renderTable),
    tableRowsEnsureCount: summaryCount(rowsEnsure),
    tableRowsEnsureP95Ms: summaryP95(rowsEnsure),
    tableRowsSyncCount: summaryCount(rowsSync),
    tableRowsSyncP95Ms: summaryP95(rowsSync),
    tableScrollCount: summaryCount(scroll),
    tableScrollMaxMs: readNumber(scroll?.maxMs),
    tableScrollP95Ms: summaryP95(scroll),
    tableSelectionSyncCount: summaryCount(selectionSync),
    tableSelectionSyncP95Ms: summaryP95(selectionSync),
    tableTouchedCellCount: readNumber(selectionSync?.touchedCellCount) ?? 0,
    tableWidgetRenderCount: summaryCount(widgetRender),
    tableWidgetRenderP95Ms: summaryP95(widgetRender),
  };
};

const getPerformanceTraceEvents = (performanceTraceReport) =>
  Array.isArray(performanceTraceReport?.events) ? performanceTraceReport.events : [];

const sumStageMeta = (events, key) =>
  events.reduce((total, event) => total + (readNumber(event.meta?.[key]) ?? 0), 0);

const maxStageMeta = (events, key) => {
  const values = events
    .map(event => readNumber(event.meta?.[key]))
    .filter(value => value != null);
  return values.length ? Math.max(...values) : null;
};

const countStageMeta = (events, key, value) =>
  events.reduce((total, event) => (
    event.meta?.[key] === value ? total + 1 : total
  ), 0);
