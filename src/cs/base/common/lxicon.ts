import {
  lxAdd as renderAdd,
  lxAnalysis as renderAnalysis,
  lxArrowLeft as renderArrowLeft,
  lxArrowRight as renderArrowRight,
  lxCheck as renderCheck,
  lxChevronDown as renderChevronDown,
  lxChevronRight as renderChevronRight,
  lxClose as renderClose,
  lxCsvGreen as renderCsvGreen,
  lxDiagnostics as renderDiagnostics,
  lxDownload as renderDownload,
  lxDownloadTray as renderDownloadTray,
  lxEdit as renderEdit,
  lxFileText as renderFileText,
  lxGear as renderGear,
  lxListUnordered as renderListUnordered,
  lxOrigin as renderOrigin,
  lxRemove as renderRemove,
  lxSearch as renderSearch,
  lxSettings as renderSettings,
  lxXlsGreen as renderXlsGreen,
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

export const lxMoreHorizontal = registerLxIcon(
  "more-horizontal",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="4" cy="8" r="1" fill="#000"/><circle cx="8" cy="8" r="1" fill="#000"/><circle cx="12" cy="8" r="1" fill="#000"/></svg>`,
);

export const lxSlidersHorizontal = registerLxIcon(
  "sliders-horizontal",
  () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#000" stroke-linecap="round" d="M2.5 4h2m3 0h6M2.5 8h6m3 0h1.5M2.5 12h3m3 0h4.5"/><circle cx="6" cy="4" r="1.5" stroke="#000"/><circle cx="10" cy="8" r="1.5" stroke="#000"/><circle cx="7" cy="12" r="1.5" stroke="#000"/></svg>`,
);

export const lxAdd = registerLxIcon("add", renderAdd);

export const lxAnalysis = registerLxIcon("analysis", renderAnalysis);

export const lxArrowLeft = registerLxIcon("arrow-left", renderArrowLeft);

export const lxArrowRight = registerLxIcon("arrow-right", renderArrowRight);

export const lxCheck = registerLxIcon("check", renderCheck);

export const lxChevronDown = registerLxIcon("chevron-down", renderChevronDown);

export const lxChevronRight = registerLxIcon("chevron-right", renderChevronRight);

export const lxClose = registerLxIcon("close", renderClose);

export const lxCsvGreen = registerLxIcon("csv-green", renderCsvGreen);

export const lxXlsGreen = registerLxIcon("xls-green", renderXlsGreen);

export const lxDiagnostics = registerLxIcon("diagnostics", renderDiagnostics);

export const lxDownload = registerLxIcon("download", renderDownload);

export const lxDownloadTray = registerLxIcon("download-tray", renderDownloadTray);

export const lxEdit = registerLxIcon("edit", renderEdit);

export const lxFileText = registerLxIcon("file-text", renderFileText);

export const lxGear = registerLxIcon("gear", renderGear);

export const lxListUnordered = registerLxIcon("list-unordered", renderListUnordered);

export const lxOrigin = registerLxIcon("origin", renderOrigin);

export const lxRemove = registerLxIcon("remove", renderRemove);

export const lxSearch = registerLxIcon("search", renderSearch);

export const lxSettings = registerLxIcon("settings", renderSettings);

export const LxIcon = {
  add: lxAdd,
  alertCircle: lxAlertCircle,
  alertTriangle: lxAlertTriangle,
  analysis: lxAnalysis,
  arrowLeft: lxArrowLeft,
  arrowRight: lxArrowRight,
  check: lxCheck,
  checkCircle: lxCheckCircle,
  chevronDown: lxChevronDown,
  chevronRight: lxChevronRight,
  close: lxClose,
  csvGreen: lxCsvGreen,
  diagnostics: lxDiagnostics,
  download: lxDownload,
  downloadTray: lxDownloadTray,
  edit: lxEdit,
  fileText: lxFileText,
  gear: lxGear,
  infoCircle: lxInfoCircle,
  listUnordered: lxListUnordered,
  moreHorizontal: lxMoreHorizontal,
  origin: lxOrigin,
  remove: lxRemove,
  search: lxSearch,
  settings: lxSettings,
  slidersHorizontal: lxSlidersHorizontal,
  xlsGreen: lxXlsGreen,
} as const;
