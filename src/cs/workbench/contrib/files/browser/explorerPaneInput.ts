/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ExplorerSelectionKind,
	IExplorerService,
} from "src/cs/workbench/contrib/files/common/explorer";
import {
	createChartExplorerFilesFromRecords,
	resolveExplorerSelectionAfterRemoval,
	resolveExplorerSelectedFileId,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import type {
	ExplorerImportedSessionFile,
	ExplorerPaneInput,
	ExplorerThumbnailPlotModel,
} from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
	ProcessingStatus,
	SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { TableModel } from "src/cs/workbench/services/table/common/table";
import type { TemplateState } from "src/cs/workbench/services/template/common/template";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import {
  createFileImportResultFromRecords,
} from "src/cs/workbench/services/files/common/files";
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

type ExplorerSelectionService = Pick<
	IExplorerService,
	| "selectedProcessedFileId"
	| "select"
	| "selectedRawFileId"
>;

export type ExplorerSessionSelection = {
	readonly selectedRawFileId: string | null;
	readonly selectedProcessedFileId: string | null;
};

type ExplorerSessionSelectionInput = {
	readonly rawFileIds: readonly string[];
	readonly processedFileIds: readonly string[];
};

type ExplorerSelectionState = Pick<
	IExplorerService,
	| "selectedProcessedFileId"
	| "selectedRawFileId"
>;

type ExplorerSessionWorkflowOptions = {
	clearSession: () => void;
	commitFileImport: (result: FileImportResult) => void;
	clearPreviewState: (options?: { clearSelection?: boolean }) => void;
	disposePreviewFileCache: (fileId: string) => void;
	invalidatePreviewRequests: () => void;
	explorerService: ExplorerSelectionService;
	previewFile?: { fileId?: string } | null;
	hasSessionData?: boolean;
	processingStatus?: Partial<ProcessingStatus>;
	rawFiles?: SessionFile[];
	removeQueuedProcessingFile: (fileId: string) => void;
	resetPreviewWorker: () => void;
	resetProcessingWorker: () => void;
	removeFiles: (fileIds: readonly string[]) => void;
};

export const createExplorerSessionSelectionInput = (
	readModel: SessionReadModel,
): ExplorerSessionSelectionInput => ({
	processedFileIds: readModel.processedFileIds,
	rawFileIds: readModel.rawFiles.flatMap(file => file.fileId ? [file.fileId] : []),
});

export const resolveExplorerSessionSelection = (
	explorerService: ExplorerSelectionState,
	readModel: SessionReadModel,
): ExplorerSessionSelection => {
	const input = createExplorerSessionSelectionInput(readModel);
	return {
		selectedProcessedFileId: resolveExplorerSelectedFileId(
			explorerService.selectedProcessedFileId,
			input.processedFileIds,
		),
		selectedRawFileId: resolveExplorerSelectedFileId(
			explorerService.selectedRawFileId,
			input.rawFileIds,
		),
	};
};

export const reconcileExplorerSessionSelection = (
	explorerService: IExplorerService,
	readModel: SessionReadModel,
): ExplorerSessionSelection => {
	const input = createExplorerSessionSelectionInput(readModel);
	const selectedProcessedFileId = reconcileExplorerSelectedFileId(
		explorerService,
		"analysis",
		explorerService.selectedProcessedFileId,
		input.processedFileIds,
	);
	const selectedRawFileId = reconcileExplorerSelectedFileId(
		explorerService,
		"raw",
		explorerService.selectedRawFileId,
		input.rawFileIds,
	);

	return {
		selectedProcessedFileId,
		selectedRawFileId,
	};
};

export function createExplorerSessionWorkflow({
	clearSession,
	commitFileImport,
	clearPreviewState,
	disposePreviewFileCache,
	invalidatePreviewRequests,
	explorerService,
	previewFile = null,
	hasSessionData = false,
	processingStatus = { state: "idle" },
	rawFiles = [],
	removeQueuedProcessingFile,
	resetPreviewWorker,
	resetProcessingWorker,
	removeFiles,
}: ExplorerSessionWorkflowOptions) {
	const getRawFileIds = (files: readonly SessionFile[] = rawFiles): readonly string[] =>
		files
			.map(file => String(file.fileId ?? "").trim())
			.filter(fileId => fileId.length > 0);
	const getSelectedRawFileId = (files: readonly SessionFile[] = rawFiles): string | null =>
		explorerService.selectedRawFileId ??
		resolveExplorerSelectedFileId(null, getRawFileIds(files));

	const preparePreviewSelection = (options?: { clearCurrentPreview?: boolean }) => {
		invalidatePreviewRequests();
		if (options?.clearCurrentPreview) {
			clearPreviewState();
		}
	};

	const hasData = hasSessionData || rawFiles.length > 0 || previewFile !== null;

	const commitImportedFiles = (
		files: readonly ExplorerImportedSessionFile[],
		mode: "append" | "replace",
	): void => {
		const importRecords = getImportedFileRecords(files);
		if (mode === "replace") {
			clearSession();
		}
		commitFileImport(createFileImportResultFromRecords(importRecords));
	};

	const handleClearSession = () => {
		if (!hasData) {
			return;
		}

		resetProcessingWorker();
		invalidatePreviewRequests();
		clearPreviewState({ clearSelection: true });

		clearSession();
		explorerService.select({ kind: "raw", fileId: null });
		resetPreviewWorker();
	};

	const handleFileImported = (fileInfo: ExplorerImportedSessionFile) => {
		const importedFileId = fileInfo?.fileId ?? null;
		const selectedRawFileId = getSelectedRawFileId();
		commitImportedFiles([fileInfo], "append");
		if (importedFileId && !selectedRawFileId) {
			preparePreviewSelection();
			explorerService.select({
				candidateFileIds: getRawFileIds([...rawFiles, fileInfo]),
				fileId: importedFileId,
				kind: "raw",
			}, "force");
		}
	};

	const handleFilesAdded = (files: ExplorerImportedSessionFile[]) => {
		if (!files.length) {
			return;
		}

		const selectedRawFileId = getSelectedRawFileId();
		const nextSelectedFileId = selectedRawFileId ?? files[0]?.fileId ?? null;
		commitImportedFiles(files, "append");
		if (!selectedRawFileId && nextSelectedFileId) {
			preparePreviewSelection();
			explorerService.select({
				candidateFileIds: getRawFileIds([...rawFiles, ...files]),
				fileId: nextSelectedFileId,
				kind: "raw",
			}, "force");
		}
	};

	const handleFilesReplaced = (files: ExplorerImportedSessionFile[]) => {
		resetProcessingWorker();
		invalidatePreviewRequests();
		clearPreviewState({ clearSelection: true });

		for (const file of rawFiles) {
			if (file?.fileId) {
				disposePreviewFileCache(file.fileId);
			}
		}

		resetPreviewWorker();

		const nextSelectedFileId = files[0]?.fileId ?? null;
		commitImportedFiles(files, "replace");
		if (nextSelectedFileId) {
			preparePreviewSelection();
		}
		explorerService.select({
			candidateFileIds: getRawFileIds(files),
			fileId: nextSelectedFileId,
			kind: "raw",
		}, "force");
	};

	const handleFileRemoved = (fileId: string) => {
		handleFilesRemoved([fileId]);
	};

	const handleFilesRemoved = (fileIds: readonly string[]) => {
		const removedFileIds = new Set(
			fileIds
				.map((fileId) => String(fileId ?? "").trim())
				.filter((fileId) => fileId.length > 0),
		);
		if (removedFileIds.size === 0) {
			return;
		}

		const previousSelectedFileId = resolveExplorerSelectedFileId(
			explorerService.selectedRawFileId,
			getRawFileIds(),
		);
		const remainingFiles = rawFiles.filter(entry =>
			!removedFileIds.has(String(entry.fileId ?? "").trim())
		);
		const remainingFileIds = getRawFileIds(remainingFiles);

		removeFiles([...removedFileIds]);
		const nextSelectedFileId = resolveExplorerSelectionAfterRemoval({
			currentFileId: explorerService.selectedRawFileId,
			remainingFileIds,
			removedFileIds: [...removedFileIds],
		});
		explorerService.select({
			candidateFileIds: remainingFileIds,
			fileId: nextSelectedFileId,
			kind: "raw",
		}, "force");

		if (processingStatus.state === "processing") {
			for (const fileId of removedFileIds) {
				removeQueuedProcessingFile(fileId);
			}
		}

		if (previewFile?.fileId && removedFileIds.has(previewFile.fileId)) {
			clearPreviewState();
		}

		for (const fileId of removedFileIds) {
			disposePreviewFileCache(fileId);
		}

		if (
			previousSelectedFileId &&
			removedFileIds.has(previousSelectedFileId) &&
			nextSelectedFileId
		) {
			preparePreviewSelection();
		}
	};

	const handleFileSelected = (fileId: string | null) => {
		if (!fileId) {
			explorerService.select({ kind: "raw", fileId: null });
			return;
		}

		const previousSelectedFileId = resolveExplorerSelectedFileId(
			explorerService.selectedRawFileId,
			getRawFileIds(),
		);
		const nextSelectedFileId = explorerService.select({
			candidateFileIds: getRawFileIds(),
			fileId,
			kind: "raw",
		}, "force");
		const isSelectionChanging = Boolean(nextSelectedFileId) &&
			previousSelectedFileId !== nextSelectedFileId;
		if (isSelectionChanging) {
			const previewFileId = previewFile?.fileId ?? null;
			preparePreviewSelection({
				clearCurrentPreview: Boolean(previewFileId) && previewFileId !== nextSelectedFileId,
			});
		}
	};

	return {
		handleClearSession,
		handleFileImported,
		handleFilesAdded,
		handleFilesReplaced,
		handleFileRemoved,
		handleFilesRemoved,
		handleFileSelected,
		hasSessionData: hasData,
	};
}

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
	const sessionWorkflow = createExplorerSessionWorkflow({
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
	const selectedFileId = resolveExplorerSelectedFileId(
		selectionKind === "analysis"
			? explorerService.selectedProcessedFileId
			: explorerService.selectedRawFileId,
		fileIds,
	);
	const currentTemplate = createCurrentTemplateSelectionDisplay({
		formName: templateState.formState.name,
		selectedTemplateId: templateState.selectedTemplateId,
	});
	const onFileSelected = isChartMode
		? (fileId: string | null): void => {
			const nextFileId = String(fileId ?? "").trim() || null;
			if (!nextFileId) {
				explorerService.select({ kind: "analysis", fileId: null });
				return;
			}

			explorerService.select({
				candidateFileIds: readModel.processedFileIds,
				fileId: nextFileId,
				kind: "analysis",
			}, "force");
		}
		: sessionWorkflow.handleFileSelected;

	return {
		activePlotType,
		currentTemplateLabel: currentTemplate.label,
		currentTemplateSelection: currentTemplate.selection,
		fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
		files,
		mode,
		onFileImported: sessionWorkflow.handleFileImported,
		onFileRemoved: sessionWorkflow.handleFileRemoved,
		onFileSelected,
		onFilesAdded: sessionWorkflow.handleFilesAdded,
		onFilesRemoved: sessionWorkflow.handleFilesRemoved,
		onFilesReplaced: sessionWorkflow.handleFilesReplaced,
		originOpenPlotOptions,
		plotAxisSettings,
		selectedFileId,
		selectionKind,
		thumbnailFiles: readModel.processedFiles,
		thumbnailPlotModelsByFileId,
	};
};

const getImportedFileRecords = (
	files: readonly ExplorerImportedSessionFile[],
): readonly ImportedFileRecord[] => {
	return files.map(file => file.importRecord);
};

const reconcileExplorerSelectedFileId = (
	explorerService: Pick<IExplorerService, "select">,
	kind: ExplorerSelectionKind,
	selectedFileId: string | null,
	fileIds: readonly string[],
): string | null => {
	const nextSelectedFileId = resolveExplorerSelectedFileId(selectedFileId, fileIds);
	explorerService.select({
		candidateFileIds: fileIds,
		fileId: nextSelectedFileId,
		kind,
	});
	return nextSelectedFileId;
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
