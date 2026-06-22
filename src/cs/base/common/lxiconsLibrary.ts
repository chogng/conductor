/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

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
} from "@chogng/lxicons";

export type LxIconLibraryEntry = {
	readonly id: string;
	readonly render: () => string;
};

export const lxiconsLibrary = {
	add: {
		id: "add",
		render: renderAdd,
	},
	alertCircle: {
		id: "alert-circle",
		render: () =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 4.75v3.5"/><circle cx="8" cy="11.25" r=".75" fill="#000"/></svg>`,
	},
	alertTriangle: {
		id: "alert-triangle",
		render: () =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#000" stroke-linejoin="round" d="M7.118 2.984a1 1 0 0 1 1.764 0l5.008 9.766A1 1 0 0 1 13 14.2H3a1 1 0 0 1-.89-1.45Z"/><path stroke="#000" stroke-linecap="round" d="M8 5.5v3.5"/><circle cx="8" cy="11.4" r=".75" fill="#000"/></svg>`,
	},
	analysis: {
		id: "analysis",
		render: renderAnalysis,
	},
	appearance: {
		id: "appearance",
		render: renderAppearance,
	},
	arrowLeft: {
		id: "arrow-left",
		render: renderArrowLeft,
	},
	arrowRight: {
		id: "arrow-right",
		render: renderArrowRight,
	},
	chart: {
		id: "chart",
		render: renderAnalysis,
	},
	check: {
		id: "check",
		render: renderCheck,
	},
	checkCircle: {
		id: "check-circle",
		render: () =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" stroke-linejoin="round" d="M11 6 7.25 9.75 5.5 8"/></svg>`,
	},
	chevronDown: {
		id: "chevron-down",
		render: renderChevronDown,
	},
	chevronRight: {
		id: "chevron-right",
		render: renderChevronRight,
	},
	close: {
		id: "close",
		render: renderClose,
	},
	copy: {
		id: "copy",
		render: renderCopy,
	},
	csvGreen: {
		id: "csv-green",
		render: renderCsvGreen,
	},
	csvLetter: {
		id: "csv-letter-filled",
		render: renderCsvLetterFilled,
	},
	diagnostics: {
		id: "diagnostics",
		render: renderDiagnostics,
	},
	download: {
		id: "download",
		render: renderDownload,
	},
	downloadTray: {
		id: "download-tray",
		render: renderDownloadTray,
	},
	edit: {
		id: "edit",
		render: renderEdit,
	},
	exportTray: {
		id: "export-tray",
		render: renderExportTray,
	},
	fileText: {
		id: "file-text",
		render: renderFileText,
	},
	gear: {
		id: "gear",
		render: renderGear,
	},
	infoCircle: {
		id: "info-circle",
		render: () =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 7v4"/><circle cx="8" cy="4.75" r=".75" fill="#000"/></svg>`,
	},
	layoutSidebarLeftEmpty: {
		id: "layout-sidebar-left-empty",
		render: renderLayoutSidebarLeftEmpty,
	},
	layoutSidebarLeftOffEmpty: {
		id: "layout-sidebar-left-off-empty",
		render: renderLayoutSidebarLeftOffEmpty,
	},
	layoutSidebarRightEmpty: {
		id: "layout-sidebar-right-empty",
		render: renderLayoutSidebarRightEmpty,
	},
	legend: {
		id: "legend",
		render: renderLegend,
	},
	listUnordered: {
		id: "list-unordered",
		render: renderListUnordered,
	},
	moreHorizontal: {
		id: "more-horizontal",
		render: () =>
			`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="4" cy="8" r="1" fill="#000"/><circle cx="8" cy="8" r="1" fill="#000"/><circle cx="12" cy="8" r="1" fill="#000"/></svg>`,
	},
	origin: {
		id: "origin",
		render: renderOrigin,
	},
	parameters: {
		id: "parameters",
		render: renderParameters,
	},
	pinned: {
		id: "pinned",
		render: renderPinned,
	},
	refresh: {
		id: "refresh",
		render: renderRefresh,
	},
	remove: {
		id: "remove",
		render: renderRemove,
	},
	screenFull: {
		id: "screen-full",
		render: renderScreenFull,
	},
	screenNormal: {
		id: "screen-normal",
		render: renderScreenNormal,
	},
	search: {
		id: "search",
		render: renderSearch,
	},
	settings: {
		id: "settings",
		render: renderSettings,
	},
	summary: {
		id: "summary",
		render: renderSummary,
	},
	trashFlat: {
		id: "trash-flat",
		render: renderTrashFlat,
	},
	unpin: {
		id: "unpin",
		render: renderUnpin,
	},
	xlsGreen: {
		id: "xls-green",
		render: renderXlsGreen,
	},
	xlsLetter: {
		id: "xls-letter-filled",
		render: renderXlsLetterFilled,
	},
} as const satisfies Record<string, LxIconLibraryEntry>;
