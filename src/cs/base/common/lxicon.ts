/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	lxiconsLibrary,
	type LxIconLibraryEntry,
} from "src/cs/base/common/lxiconsLibrary";

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

const registerLibraryIcon = (entry: LxIconLibraryEntry): LxIcon =>
	registerLxIcon(entry.id, entry.render);

export const lxAlertCircle = registerLibraryIcon(lxiconsLibrary.alertCircle);
export const lxAlertTriangle = registerLibraryIcon(lxiconsLibrary.alertTriangle);
export const lxCheckCircle = registerLibraryIcon(lxiconsLibrary.checkCircle);
export const lxInfoCircle = registerLibraryIcon(lxiconsLibrary.infoCircle);
export const lxLayoutSidebarLeftEmpty = registerLibraryIcon(lxiconsLibrary.layoutSidebarLeftEmpty);
export const lxLayoutSidebarLeftOffEmpty = registerLibraryIcon(lxiconsLibrary.layoutSidebarLeftOffEmpty);
export const lxLayoutSidebarRightEmpty = registerLibraryIcon(lxiconsLibrary.layoutSidebarRightEmpty);
export const lxMoreHorizontal = registerLibraryIcon(lxiconsLibrary.moreHorizontal);
export const lxAdd = registerLibraryIcon(lxiconsLibrary.add);
export const lxAnalysis = registerLibraryIcon(lxiconsLibrary.analysis);
export const lxAppearance = registerLibraryIcon(lxiconsLibrary.appearance);
export const lxChart = registerLibraryIcon(lxiconsLibrary.chart);
export const lxArrowLeft = registerLibraryIcon(lxiconsLibrary.arrowLeft);
export const lxArrowRight = registerLibraryIcon(lxiconsLibrary.arrowRight);
export const lxCheck = registerLibraryIcon(lxiconsLibrary.check);
export const lxChevronDown = registerLibraryIcon(lxiconsLibrary.chevronDown);
export const lxChevronRight = registerLibraryIcon(lxiconsLibrary.chevronRight);
export const lxClose = registerLibraryIcon(lxiconsLibrary.close);
export const lxCopy = registerLibraryIcon(lxiconsLibrary.copy);
export const lxCsvGreen = registerLibraryIcon(lxiconsLibrary.csvGreen);
export const lxCsvLetterFilled = registerLibraryIcon(lxiconsLibrary.csvLetter);
export const lxXlsGreen = registerLibraryIcon(lxiconsLibrary.xlsGreen);
export const lxXlsLetterFilled = registerLibraryIcon(lxiconsLibrary.xlsLetter);
export const lxExportTray = registerLibraryIcon(lxiconsLibrary.exportTray);
export const lxTrashFlat = registerLibraryIcon(lxiconsLibrary.trashFlat);
export const lxDiagnostics = registerLibraryIcon(lxiconsLibrary.diagnostics);
export const lxDownload = registerLibraryIcon(lxiconsLibrary.download);
export const lxDownloadTray = registerLibraryIcon(lxiconsLibrary.downloadTray);
export const lxEdit = registerLibraryIcon(lxiconsLibrary.edit);
export const lxFileText = registerLibraryIcon(lxiconsLibrary.fileText);
export const lxGear = registerLibraryIcon(lxiconsLibrary.gear);
export const lxListUnordered = registerLibraryIcon(lxiconsLibrary.listUnordered);
export const lxLegend = registerLibraryIcon(lxiconsLibrary.legend);
export const lxOrigin = registerLibraryIcon(lxiconsLibrary.origin);
export const lxParameters = registerLibraryIcon(lxiconsLibrary.parameters);
export const lxRemove = registerLibraryIcon(lxiconsLibrary.remove);
export const lxSearch = registerLibraryIcon(lxiconsLibrary.search);
export const lxSettings = registerLibraryIcon(lxiconsLibrary.settings);
export const lxScreenFull = registerLibraryIcon(lxiconsLibrary.screenFull);
export const lxScreenNormal = registerLibraryIcon(lxiconsLibrary.screenNormal);
export const lxSummary = registerLibraryIcon(lxiconsLibrary.summary);
export const lxPinned = registerLibraryIcon(lxiconsLibrary.pinned);
export const lxUnpin = registerLibraryIcon(lxiconsLibrary.unpin);
export const lxRefresh = registerLibraryIcon(lxiconsLibrary.refresh);

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
