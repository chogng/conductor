/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	lxAdd as renderAdd,
	lxAppearance as renderAppearance,
	lxArrowLeft as renderArrowLeft,
	lxArrowRight as renderArrowRight,
	lxChart as renderChart,
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
	lxLayoutSidebarRightOffEmpty as renderLayoutSidebarRightOffEmpty,
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
	lxTable as renderTable,
	lxPinned as renderPinned,
	lxUnpin as renderUnpin,
	lxXlsLetterFilled as renderXlsLetterFilled,
	lxXlsGreen as renderXlsGreen,
	lxTrashFlat as renderTrashFlat,
} from "@chogng/lxicons";
import { LxIcon } from "src/cs/base/common/lxicon";

type LxIconRenderer = () => string;

const renderersByIconId = new Map<string, LxIconRenderer>([
	[LxIcon.add.id, renderAdd],
	[LxIcon.alertCircle.id, () =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 4.75v3.5"/><circle cx="8" cy="11.25" r=".75" fill="#000"/></svg>`],
	[LxIcon.alertTriangle.id, () =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><path stroke="#000" stroke-linejoin="round" d="M7.118 2.984a1 1 0 0 1 1.764 0l5.008 9.766A1 1 0 0 1 13 14.2H3a1 1 0 0 1-.89-1.45Z"/><path stroke="#000" stroke-linecap="round" d="M8 5.5v3.5"/><circle cx="8" cy="11.4" r=".75" fill="#000"/></svg>`],
	[LxIcon.appearance.id, renderAppearance],
	[LxIcon.arrowLeft.id, renderArrowLeft],
	[LxIcon.arrowRight.id, renderArrowRight],
	[LxIcon.chart.id, renderChart],
	[LxIcon.check.id, renderCheck],
	[LxIcon.checkCircle.id, () =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" stroke-linejoin="round" d="M11 6 7.25 9.75 5.5 8"/></svg>`],
	[LxIcon.chevronDown.id, renderChevronDown],
	[LxIcon.chevronRight.id, renderChevronRight],
	[LxIcon.close.id, renderClose],
	[LxIcon.copy.id, renderCopy],
	[LxIcon.csvGreen.id, renderCsvGreen],
	[LxIcon.csvLetter.id, renderCsvLetterFilled],
	[LxIcon.diagnostics.id, renderDiagnostics],
	[LxIcon.download.id, renderDownload],
	[LxIcon.downloadTray.id, renderDownloadTray],
	[LxIcon.edit.id, renderEdit],
	[LxIcon.exportTray.id, renderExportTray],
	[LxIcon.fileText.id, renderFileText],
	[LxIcon.gear.id, renderGear],
	[LxIcon.infoCircle.id, () =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="#000"/><path stroke="#000" stroke-linecap="round" d="M8 7v4"/><circle cx="8" cy="4.75" r=".75" fill="#000"/></svg>`],
	[LxIcon.layoutSidebarLeftEmpty.id, renderLayoutSidebarLeftEmpty],
	[LxIcon.layoutSidebarLeftOffEmpty.id, renderLayoutSidebarLeftOffEmpty],
	[LxIcon.layoutSidebarRightEmpty.id, renderLayoutSidebarRightEmpty],
	[LxIcon.layoutSidebarRightOffEmpty.id, renderLayoutSidebarRightOffEmpty],
	[LxIcon.legend.id, renderLegend],
	[LxIcon.listUnordered.id, renderListUnordered],
	[LxIcon.moreHorizontal.id, () =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="4" cy="8" r="1" fill="#000"/><circle cx="8" cy="8" r="1" fill="#000"/><circle cx="12" cy="8" r="1" fill="#000"/></svg>`],
	[LxIcon.origin.id, renderOrigin],
	[LxIcon.parameters.id, renderParameters],
	[LxIcon.pinned.id, renderPinned],
	[LxIcon.refresh.id, renderRefresh],
	[LxIcon.remove.id, renderRemove],
	[LxIcon.screenFull.id, renderScreenFull],
	[LxIcon.screenNormal.id, renderScreenNormal],
	[LxIcon.search.id, renderSearch],
	[LxIcon.settings.id, renderSettings],
	[LxIcon.summary.id, renderSummary],
	[LxIcon.table.id, renderTable],
	[LxIcon.trashFlat.id, renderTrashFlat],
	[LxIcon.unpin.id, renderUnpin],
	[LxIcon.xlsGreen.id, renderXlsGreen],
	[LxIcon.xlsLetter.id, renderXlsLetterFilled],
]);

const ROOT_SVG_TAG_PATTERN = /<svg\b([^>]*)>/i;
const ROOT_WIDTH_PATTERN = /\swidth="[^"]*"/i;
const ROOT_HEIGHT_PATTERN = /\sheight="[^"]*"/i;
const HEX_BLACK_PATTERN = /#000000\b|#000\b/gi;
const BLACK_KEYWORD_PATTERN = /\bblack\b/gi;

function normalizeLxIconMarkup(renderer: LxIconRenderer): string {
	const currentColorMarkup = renderer()
		.trim()
		.replace(HEX_BLACK_PATTERN, "currentColor")
		.replace(BLACK_KEYWORD_PATTERN, "currentColor");

	return currentColorMarkup.replace(
		ROOT_SVG_TAG_PATTERN,
		(_match, attributes: string) => {
			const normalizedAttributes = attributes
				.replace(ROOT_WIDTH_PATTERN, ' width="100%"')
				.replace(ROOT_HEIGHT_PATTERN, ' height="100%"');

			return `<svg${normalizedAttributes} focusable="false" aria-hidden="true">`;
		},
	);
}

export function renderLxIcon(icon: LxIcon): SVGSVGElement {
	const renderer = renderersByIconId.get(icon.id);
	if (!renderer) {
		throw new Error(`Unknown LxIcon: ${icon.id}`);
	}

	const container = document.createElement("div");
	container.innerHTML = normalizeLxIconMarkup(renderer);
	const svg = container.firstElementChild;
	if (!(svg instanceof SVGSVGElement)) {
		throw new Error(`Invalid LxIcon SVG: ${icon.id}`);
	}

	return svg;
}
