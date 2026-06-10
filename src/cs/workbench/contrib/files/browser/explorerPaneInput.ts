/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	IExplorerService,
} from "src/cs/workbench/contrib/files/common/explorer";
import { createChartExplorerFilesFromRecords } from "src/cs/workbench/contrib/files/common/explorerInput";
import { createExplorerSessionWorkflow } from "src/cs/workbench/contrib/files/browser/explorerSessionWorkflow";
import type {
	ExplorerPaneInput,
	ExplorerThumbnailPlotModel,
} from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type { ProcessingStatus } from "src/cs/workbench/services/session/common/sessionTypes";
import type { TableModel } from "src/cs/workbench/services/table/common/table";
import type { TemplateState } from "src/cs/workbench/services/template/common/template";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import {
	createCurrentTemplateSelectionDisplay,
} from "src/cs/workbench/services/template/common/templateSelection";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
	IPlotService,
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";

export type ExplorerPaneSessionInput = {
	readonly clearSession: () => void;
	readonly commitFileImport: (result: FileImportResult) => void;
	readonly removeFiles: (fileIds: readonly string[]) => void;
};

export type ExplorerPaneProcessingInput = {
	readonly processingStatus?: Partial<ProcessingStatus>;
	readonly removeQueuedProcessingFile: (fileId: string) => void;
	readonly resetProcessingWorker: () => void;
};

export type CreateExplorerPaneInputOptions = {
	readonly activePlotType: PlotType;
	readonly explorerService: IExplorerService;
	readonly mode: WorkbenchMainPart;
	readonly originOpenPlotOptions?: OriginPlotOptions;
	readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
	readonly plotService: Pick<IPlotService, "getCalculatedData">;
	readonly processing: ExplorerPaneProcessingInput;
	readonly readModel: SessionReadModel;
	readonly session: ExplorerPaneSessionInput;
	readonly snapshot: SessionSnapshot;
	readonly tableModel: Pick<
		TableModel,
		| "clearState"
		| "disposeFileCache"
		| "getState"
		| "invalidateRequests"
		| "resetWorker"
	>;
	readonly templateState: TemplateState;
};

export const createExplorerPaneInput = ({
	activePlotType,
	explorerService,
	mode,
	originOpenPlotOptions,
	plotAxisSettings,
	plotService,
	processing,
	readModel,
	session,
	snapshot,
	tableModel,
	templateState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
	const rawFiles = readModel.rawFiles;
	const explorerSessionWorkflow = createExplorerSessionWorkflow({
		clearSession: session.clearSession,
		commitFileImport: session.commitFileImport,
		clearPreviewState: tableModel.clearState,
		disposePreviewFileCache: tableModel.disposeFileCache,
		invalidatePreviewRequests: tableModel.invalidateRequests,
		explorerService,
		previewFile: tableModel.getState().file,
		hasSessionData: readModel.hasSessionData,
		processingStatus: processing.processingStatus,
		rawFiles,
		removeQueuedProcessingFile: processing.removeQueuedProcessingFile,
		resetPreviewWorker: tableModel.resetWorker,
		resetProcessingWorker: processing.resetProcessingWorker,
		removeFiles: session.removeFiles,
	});
	const isChartMode = mode === "chart";
	const selectionKind = isChartMode ? "analysis" : "raw";
	const files = isChartMode
		? createChartExplorerFilesFromRecords(
			snapshot.filesById,
			snapshot.fileOrder,
			rawFiles,
		)
		: rawFiles;
	const fileIds = getExplorerPaneFileIds(files);
	const thumbnailPlotModelsByFileId = isChartMode
		? createThumbnailPlotModelsByFileId({
			activePlotType,
			fileIds: readModel.processedFileIds,
			plotService,
			snapshot,
		})
		: undefined;
	const selectedFileId = explorerService.resolveSelectedFileId(selectionKind, fileIds);
	const currentTemplate = createCurrentTemplateSelectionDisplay({
		formName: templateState.formState.name,
		selectedTemplateId: templateState.selectedTemplateId,
	});
	const onFileSelected = isChartMode
		? (fileId: string | null): void => {
			const nextFileId = String(fileId ?? "").trim() || null;
			if (!nextFileId) {
				explorerService.clearSelection("analysis");
				return;
			}

			explorerService.select({
				candidateFileIds: readModel.processedFileIds,
				fileId: nextFileId,
				kind: "analysis",
			}, "force");
		}
		: explorerSessionWorkflow.handleFileSelected;

	return {
		activePlotType,
		currentTemplateLabel: currentTemplate.label,
		currentTemplateSelection: currentTemplate.selection,
		fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
		files,
		mode,
		onFileImported: explorerSessionWorkflow.handleFileImported,
		onFileRemoved: explorerSessionWorkflow.handleFileRemoved,
		onFileSelected,
		onFilesAdded: explorerSessionWorkflow.handleFilesAdded,
		onFilesRemoved: explorerSessionWorkflow.handleFilesRemoved,
		onFilesReplaced: explorerSessionWorkflow.handleFilesReplaced,
		originOpenPlotOptions,
		plotAxisSettings,
		selectedFileId,
		selectionKind,
		thumbnailFiles: readModel.processedFiles,
		thumbnailPlotModelsByFileId,
	};
};

const getExplorerPaneFileIds = (
	files: readonly { readonly fileId?: string | null }[],
): readonly string[] => {
	return files
		.map(file => String(file.fileId ?? "").trim())
		.filter(fileId => fileId.length > 0);
};

const createThumbnailPlotModelsByFileId = ({
	activePlotType,
	fileIds,
	plotService,
	snapshot,
}: {
	readonly activePlotType: PlotType;
	readonly fileIds: readonly string[];
	readonly plotService: Pick<IPlotService, "getCalculatedData">;
	readonly snapshot: SessionSnapshot;
}): Readonly<Record<string, ExplorerThumbnailPlotModel>> => {
	const modelsByFileId: Record<string, ExplorerThumbnailPlotModel> = {};
	for (const fileId of fileIds) {
		const normalizedFileId = String(fileId ?? "").trim();
		if (!normalizedFileId) {
			continue;
		}

		const model = plotService.getCalculatedData({
			fileId: normalizedFileId,
			plotType: activePlotType,
			snapshot,
		});
		if (model) {
			modelsByFileId[normalizedFileId] = model;
		}
	}

	return modelsByFileId;
};
