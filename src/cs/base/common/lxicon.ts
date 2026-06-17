import {
  lxAdd as renderAdd,
  lxAnalysis as renderAnalysis,
  lxAppearance as renderAppearance,
  lxArrowLeft as renderArrowLeft,
  lxArrowRight as renderArrowRight,
  lxCheck as renderCheck,
  lxChevronDown as renderChevronDown,
  lxChevronRight as renderChevronRight,
  lxClose as renderClose,
  lxCopy as renderCopy,
  lxCsvLetterFilled as renderCsvLetterFilled,
  lxCsvGreen as renderCsvGreen,
  lxExportTray as renderExportTray,
  lxRefresh as renderRefresh,
  lxDiagnostics as renderDiagnostics,
  lxDownload as renderDownload,
  lxDownloadTray as renderDownloadTray,
  lxEdit as renderEdit,
  lxFileText as renderFileText,
  lxGear as renderGear,
  lxLayoutSidebarLeftEmpty as renderLayoutSidebarLeftEmpty,
  lxLayoutSidebarLeftOffEmpty as renderLayoutSidebarLeftOffEmpty,
  lxLayoutSidebarRightEmpty as renderLayoutSidebarRightEmpty,
  lxListUnordered as renderListUnordered,
  lxLegend as renderLegend,
  lxOrigin as renderOrigin,
  lxParameters as renderParameters,
  lxRemove as renderRemove,
  lxSearch as renderSearch,
  lxSettings as renderSettings,
  lxScreenFull as renderScreenFull,
  lxScreenNormal as renderScreenNormal,
  lxSummary as renderSummary,
  lxPinned as renderPinned,
  lxUnpin as renderUnpin,
  lxXlsLetterFilled as renderXlsLetterFilled,
  lxXlsGreen as renderXlsGreen,
  lxTrashFlat as renderTrashFlat,
} from "@chogng/lxicon";

export type LxIconRenderer = () => string;

export type LxIconDefinition = LxIcon | LxIconRenderer;

export type LxIcon = {
  readonly id: string;
  readonly render: LxIconRenderer;
};

const iconsById = new Map<string, LxIcon>();

export const registerLxIcon = (id: string, render: LxIconRenderer): LxIcon => {
  const existing = iconsById.get(id);
  if (existing) {
    return existing;
  }

  const icon = { id, render };
  iconsById.set(id, icon);
  return icon;
};

export const getLxIcon = (id: string): LxIcon | undefined => iconsById.get(id);

export const getAllLxIcons = (): readonly LxIcon[] => Array.from(iconsById.values());

export const resolveLxIconRenderer = (icon: LxIconDefinition): LxIconRenderer =>
  typeof icon === "function" ? icon : icon.render;

export const lxAlertCircle = registerLxIcon(
  "alert-circle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 4.75v3.5"/><circle cx="8" cy="11.25" r=".75" fill="#000"/></svg>`,
);

export const lxAlertTriangle = registerLxIcon(
  "alert-triangle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#000" stroke-linejoin="round" d="M7.118 2.984a1 1 0 0 1 1.764 0l5.008 9.766A1 1 0 0 1 13 14.2H3a1 1 0 0 1-.89-1.45Z"/><path stroke="#000" stroke-linecap="round" d="M8 5.5v3.5"/><circle cx="8" cy="11.4" r=".75" fill="#000"/></svg>`,
);

export const lxCheckCircle = registerLxIcon(
  "check-circle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" stroke-linejoin="round" d="M11 6 7.25 9.75 5.5 8"/></svg>`,
);

export const lxInfoCircle = registerLxIcon(
  "info-circle",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 7v4"/><circle cx="8" cy="4.75" r=".75" fill="#000"/></svg>`,
);

export const lxLayoutSidebarLeftEmpty = registerLxIcon(
  "layout-sidebar-left-empty",
  renderLayoutSidebarLeftEmpty,
);

export const lxLayoutSidebarLeftOffEmpty = registerLxIcon(
  "layout-sidebar-left-off-empty",
  renderLayoutSidebarLeftOffEmpty,
);

export const lxLayoutSidebarRightEmpty = registerLxIcon(
  "layout-sidebar-right-empty",
  renderLayoutSidebarRightEmpty,
);

export const lxMoreHorizontal = registerLxIcon(
  "more-horizontal",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="4" cy="8" r="1" fill="#000"/><circle cx="8" cy="8" r="1" fill="#000"/><circle cx="12" cy="8" r="1" fill="#000"/></svg>`,
);

export const lxAdd = registerLxIcon("add", renderAdd);

export const lxAnalysis = registerLxIcon("analysis", renderAnalysis);

export const lxAppearance = registerLxIcon("appearance", renderAppearance);

export const lxChart = registerLxIcon("chart", renderAnalysis);

export const lxArrowLeft = registerLxIcon("arrow-left", renderArrowLeft);

export const lxArrowRight = registerLxIcon("arrow-right", renderArrowRight);

export const lxCheck = registerLxIcon("check", renderCheck);

export const lxChevronDown = registerLxIcon("chevron-down", renderChevronDown);

export const lxChevronRight = registerLxIcon("chevron-right", renderChevronRight);

export const lxClose = registerLxIcon("close", renderClose);

export const lxCopy = registerLxIcon("copy", renderCopy);

export const lxCsvGreen = registerLxIcon("csv-green", renderCsvGreen);

export const lxCsvLetterFilled = registerLxIcon("csv-letter-filled", renderCsvLetterFilled);

export const lxXlsGreen = registerLxIcon("xls-green", renderXlsGreen);

export const lxXlsLetterFilled = registerLxIcon("xls-letter-filled", renderXlsLetterFilled);

export const lxExportTray = registerLxIcon("export-tray", renderExportTray);

export const lxTrashFlat = registerLxIcon("trash-flat", renderTrashFlat);

export const lxDiagnostics = registerLxIcon("diagnostics", renderDiagnostics);

export const lxDownload = registerLxIcon("download", renderDownload);

export const lxDownloadTray = registerLxIcon("download-tray", renderDownloadTray);

export const lxEdit = registerLxIcon("edit", renderEdit);

export const lxFileText = registerLxIcon("file-text", renderFileText);

export const lxGear = registerLxIcon("gear", renderGear);

export const lxListUnordered = registerLxIcon("list-unordered", renderListUnordered);

export const lxLegend = registerLxIcon("legend", renderLegend);

export const lxOrigin = registerLxIcon("origin", renderOrigin);

export const lxParameters = registerLxIcon("parameters", renderParameters);

export const lxRemove = registerLxIcon("remove", renderRemove);

export const lxSearch = registerLxIcon("search", renderSearch);

export const lxSettings = registerLxIcon("settings", renderSettings);

export const lxScreenFull = registerLxIcon("screen-full", renderScreenFull);

export const lxScreenNormal = registerLxIcon("screen-normal", renderScreenNormal);

export const lxSummary = registerLxIcon("summary", renderSummary);

export const lxPinned = registerLxIcon("pinned", renderPinned);

export const lxUnpin = registerLxIcon("unpin", renderUnpin);

export const lxRefresh = registerLxIcon("refresh", renderRefresh);

export const LxIcon = {
  add: lxAdd,
  alertCircle: lxAlertCircle,
  alertTriangle: lxAlertTriangle,
  analysis: lxAnalysis,
  appearance: lxAppearance,
  arrowLeft: lxArrowLeft,
  arrowRight: lxArrowRight,
  chart: lxChart,
  check: lxCheck,
  checkCircle: lxCheckCircle,
  chevronDown: lxChevronDown,
  chevronRight: lxChevronRight,
  close: lxClose,
  copy: lxCopy,
  csvGreen: lxCsvGreen,
  diagnostics: lxDiagnostics,
  csvLetter: lxCsvLetterFilled,
  download: lxDownload,
  downloadTray: lxDownloadTray,
  edit: lxEdit,
  fileText: lxFileText,
  gear: lxGear,
  infoCircle: lxInfoCircle,
  layoutSidebarLeftEmpty: lxLayoutSidebarLeftEmpty,
  layoutSidebarLeftOffEmpty: lxLayoutSidebarLeftOffEmpty,
  layoutSidebarRightEmpty: lxLayoutSidebarRightEmpty,
  listUnordered: lxListUnordered,
  legend: lxLegend,
  moreHorizontal: lxMoreHorizontal,
  origin: lxOrigin,
  parameters: lxParameters,
  exportTray: lxExportTray,
  remove: lxRemove,
  search: lxSearch,
  trashFlat: lxTrashFlat,
  settings: lxSettings,
  screenFull: lxScreenFull,
  screenNormal: lxScreenNormal,
  summary: lxSummary,
  pinned: lxPinned,
  unpin: lxUnpin,
  xlsGreen: lxXlsGreen,
  xlsLetter: lxXlsLetterFilled,
  refresh: lxRefresh,
} as const;
