/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type LxIcon = {
	readonly id: string;
};

function defineLxIcon(id: string): LxIcon {
	return { id };
}

export const lxAlertCircle = defineLxIcon("alert-circle");
export const lxAlertTriangle = defineLxIcon("alert-triangle");
export const lxCheckCircle = defineLxIcon("check-circle");
export const lxInfoCircle = defineLxIcon("info-circle");
export const lxLayoutSidebarLeftEmpty = defineLxIcon("layout-sidebar-left-empty");
export const lxLayoutSidebarLeftOffEmpty = defineLxIcon("layout-sidebar-left-off-empty");
export const lxLayoutSidebarRightEmpty = defineLxIcon("layout-sidebar-right-empty");
export const lxLayoutSidebarRightOffEmpty = defineLxIcon("layout-sidebar-right-off-empty");
export const lxMoreHorizontal = defineLxIcon("more-horizontal");
export const lxAdd = defineLxIcon("add");
export const lxAppearance = defineLxIcon("appearance");
export const lxChart = defineLxIcon("chart");
export const lxArrowLeft = defineLxIcon("arrow-left");
export const lxArrowRight = defineLxIcon("arrow-right");
export const lxCheck = defineLxIcon("check");
export const lxChevronDown = defineLxIcon("chevron-down");
export const lxChevronRight = defineLxIcon("chevron-right");
export const lxClose = defineLxIcon("close");
export const lxCopy = defineLxIcon("copy");
export const lxCsvGreen = defineLxIcon("csv-green");
export const lxCsvLetterFilled = defineLxIcon("csv-letter-filled");
export const lxXlsGreen = defineLxIcon("xls-green");
export const lxXlsLetterFilled = defineLxIcon("xls-letter-filled");
export const lxExportTray = defineLxIcon("export-tray");
export const lxTrashFlat = defineLxIcon("trash-flat");
export const lxDiagnostics = defineLxIcon("diagnostics");
export const lxDownload = defineLxIcon("download");
export const lxDownloadTray = defineLxIcon("download-tray");
export const lxEdit = defineLxIcon("edit");
export const lxFileText = defineLxIcon("file-text");
export const lxGear = defineLxIcon("gear");
export const lxListUnordered = defineLxIcon("list-unordered");
export const lxLegend = defineLxIcon("legend");
export const lxOrigin = defineLxIcon("origin");
export const lxParameters = defineLxIcon("parameters");
export const lxRemove = defineLxIcon("remove");
export const lxSearch = defineLxIcon("search");
export const lxSettings = defineLxIcon("settings");
export const lxScreenFull = defineLxIcon("screen-full");
export const lxScreenNormal = defineLxIcon("screen-normal");
export const lxSummary = defineLxIcon("summary");
export const lxTable = defineLxIcon("table");
export const lxPinned = defineLxIcon("pinned");
export const lxUnpin = defineLxIcon("unpin");
export const lxRefresh = defineLxIcon("refresh");

export const LxIcon = {
	add: lxAdd,
	alertCircle: lxAlertCircle,
	alertTriangle: lxAlertTriangle,
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
	layoutSidebarRightOffEmpty: lxLayoutSidebarRightOffEmpty,
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
	table: lxTable,
	pinned: lxPinned,
	unpin: lxUnpin,
	xlsGreen: lxXlsGreen,
	xlsLetter: lxXlsLetterFilled,
	refresh: lxRefresh,
} as const;
