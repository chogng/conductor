/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	isEqualOrParent as isPathEqualOrParent,
	toSlashes,
} from "src/cs/base/common/extpath";
import type {
	ProcessedEntry,
	SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
	FileId,
	FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	collectFileRecordBaseCurves,
	getFileRecordCurveType,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";

export type ExplorerFileEntry = {
	readonly file?: unknown;
	readonly fileId?: string;
	readonly fileName?: string;
	readonly itemKey?: string;
	readonly normalizedCsvPath?: string | null;
	readonly relativePath?: string | null;
	readonly sourceKey?: string;
	readonly sourcePath?: string | null;
	readonly curveType?: string | null;
	readonly curveTypeConfidence?: "high" | "medium" | "low";
	readonly curveTypeNeedsTemplate?: boolean;
	readonly curveTypeReasons?: readonly string[];
};

export type ExplorerTreeNode<TEntry extends ExplorerFileEntry = ExplorerFileEntry> = {
	readonly children?: ExplorerTreeNode<TEntry>[];
	readonly entry?: TEntry;
	readonly key: string;
	readonly kind: "folder" | "file";
	readonly name: string;
};

type MutableExplorerTreeNode<TEntry extends ExplorerFileEntry> = {
	children?: MutableExplorerTreeNode<TEntry>[];
	entry?: TEntry;
	key: string;
	kind: "folder" | "file";
	name: string;
};

const normalizePath = (value: unknown): string[] =>
	toSlashes(String(value ?? ""))
		.split("/")
		.map(part => part.trim())
		.filter(Boolean);

const getExplorerFileName = <TEntry extends ExplorerFileEntry>(entry: TEntry): string => {
	if (
		entry.file &&
		typeof entry.file === "object" &&
		"name" in entry.file
	) {
		return String(entry.file.name ?? "");
	}

	return String(entry.fileName ?? "");
};

const compareExplorerTreeNodes = <TEntry extends ExplorerFileEntry>(
	first: MutableExplorerTreeNode<TEntry>,
	second: MutableExplorerTreeNode<TEntry>,
): number => {
	if (first.kind !== second.kind) {
		return first.kind === "folder" ? -1 : 1;
	}

	return first.name.localeCompare(second.name, undefined, {
		numeric: true,
		sensitivity: "base",
	});
};

const freezeExplorerTreeNode = <TEntry extends ExplorerFileEntry>(
	node: MutableExplorerTreeNode<TEntry>,
): ExplorerTreeNode<TEntry> => ({
	children: node.children?.sort(compareExplorerTreeNodes).map(freezeExplorerTreeNode),
	entry: node.entry,
	key: node.key,
	kind: node.kind,
	name: node.name,
});

export const getExplorerTreeFileName = getExplorerFileName;

export const buildExplorerTree = <TEntry extends ExplorerFileEntry>(
	entries: readonly TEntry[],
): ExplorerTreeNode<TEntry>[] => {
	const roots: MutableExplorerTreeNode<TEntry>[] = [];
	const folders = new Map<string, MutableExplorerTreeNode<TEntry>>();

	for (const entry of entries) {
		const fileName = getExplorerFileName(entry);
		const parts = normalizePath(entry.relativePath);
		const pathParts = parts.length > 0 ? parts : [fileName];
		let children = roots;
		let currentPath = "";

		for (let index = 0; index < pathParts.length - 1; index += 1) {
			const part = pathParts[index];
			if (!part) {
				continue;
			}

			currentPath = currentPath ? `${currentPath}/${part}` : part;
			let folder = folders.get(currentPath);
			if (!folder) {
				folder = {
					children: [],
					key: `folder:${currentPath}`,
					kind: "folder",
					name: part,
				};
				folders.set(currentPath, folder);
				children.push(folder);
			}
			children = folder.children ?? [];
		}

		const leafName = pathParts[pathParts.length - 1] ?? fileName;
		const fileKey = entry.fileId ?? entry.itemKey ?? `file:${pathParts.join("/")}`;
		children.push({
			entry,
			key: fileKey,
			kind: "file",
			name: leafName,
		});
	}

	return roots.sort(compareExplorerTreeNodes).map(freezeExplorerTreeNode);
};

export const collectExplorerFolderKeys = <TEntry extends ExplorerFileEntry>(
	nodes: readonly ExplorerTreeNode<TEntry>[],
): string[] => {
	const keys: string[] = [];

	const visit = (node: ExplorerTreeNode<TEntry>) => {
		if (node.kind === "folder") {
			keys.push(node.key);
		}

		for (const child of node.children ?? []) {
			visit(child);
		}
	};

	for (const node of nodes) {
		visit(node);
	}

	return keys;
};

export const getExplorerFolderPath = (folderKey: unknown): string | null => {
	const key = String(folderKey ?? "");
	if (!key.startsWith("folder:")) {
		return null;
	}

	const path = key.slice("folder:".length).trim();
	return path || null;
};

const normalizeFolderPath = (value: unknown): string =>
	toSlashes(String(value ?? ""))
		.split("/")
		.map(part => part.trim())
		.filter(Boolean)
		.join("/");

export const isExplorerPathInFolder = (
	relativePath: unknown,
	folderPath: string,
): boolean => {
	const normalizedRelativePath = normalizeFolderPath(relativePath);
	const normalizedFolderPath = normalizeFolderPath(folderPath);
	return Boolean(
		normalizedFolderPath &&
			isPathEqualOrParent(
				normalizedRelativePath,
				normalizedFolderPath,
				false,
				"/",
			),
	);
};

const getFileId = (file: Pick<ExplorerFileEntry, "fileId">): string =>
	String(file?.fileId ?? "").trim();

const getFileName = (
	processedFile: ProcessedEntry,
	rawFile: SessionFile | undefined,
	fileId: string,
): string =>
	String(processedFile.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId;

const getOptionalString = (value: unknown): string | undefined => {
	const text = String(value ?? "").trim();
	return text || undefined;
};

const hasFileRecordAnalysisData = (file: FileRecord): boolean =>
	collectFileRecordBaseCurves(file).length > 0;

export const createChartExplorerFilesFromRecords = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
	rawFiles: readonly SessionFile[] = [],
): ExplorerFileEntry[] => {
	const rawFileById = new Map<string, SessionFile>();
	for (const file of rawFiles) {
		const fileId = getFileId(file);
		if (fileId) {
			rawFileById.set(fileId, file);
		}
	}

	const orderedFileIds = new Set<FileId>();
	const files: ExplorerFileEntry[] = [];
	const pushFile = (fileId: FileId): void => {
		if (orderedFileIds.has(fileId)) {
			return;
		}
		orderedFileIds.add(fileId);

		const file = filesById[fileId];
		if (!file || !hasFileRecordAnalysisData(file)) {
			return;
		}

		const rawFile = rawFileById.get(fileId);
		files.push({
			file: file.raw.file ?? rawFile?.file,
			fileId,
			fileName: String(file.raw.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId,
			itemKey: getOptionalString(rawFile?.itemKey ?? file.raw.rawKey),
			normalizedCsvPath: file.raw.normalizedCsvPath ?? rawFile?.normalizedCsvPath,
			relativePath: file.raw.relativePath ?? rawFile?.relativePath ?? null,
			sourceKey: getOptionalString(rawFile?.sourceKey ?? file.raw.rawKey),
			sourcePath: file.raw.filePath ?? rawFile?.sourcePath,
			curveType: getFileRecordCurveType(file) ?? rawFile?.curveType ?? null,
			curveTypeConfidence: rawFile?.curveTypeConfidence,
			curveTypeNeedsTemplate: rawFile?.curveTypeNeedsTemplate,
			curveTypeReasons: rawFile?.curveTypeReasons,
		});
	};

	for (const fileId of fileOrder) {
		pushFile(fileId);
	}
	for (const fileId of Object.keys(filesById)) {
		pushFile(fileId);
	}

	return files;
};

export const createChartExplorerFiles = (
	rawFiles: readonly SessionFile[],
	processedFiles: readonly ProcessedEntry[],
): ExplorerFileEntry[] => {
	const rawFileById = new Map<string, SessionFile>();
	for (const file of rawFiles) {
		const fileId = getFileId(file);
		if (fileId) {
			rawFileById.set(fileId, file);
		}
	}

	const files: ExplorerFileEntry[] = [];
	for (const processedFile of processedFiles) {
		const fileId = getFileId(processedFile);
		if (!fileId) {
			continue;
		}

		const rawFile = rawFileById.get(fileId);
		files.push({
			file: rawFile?.file,
			fileId,
			fileName: getFileName(processedFile, rawFile, fileId),
			itemKey: getOptionalString(rawFile?.itemKey),
			normalizedCsvPath: rawFile?.normalizedCsvPath,
			relativePath: rawFile?.relativePath ?? null,
			sourceKey: getOptionalString(rawFile?.sourceKey),
			sourcePath: rawFile?.sourcePath,
			curveType: processedFile.curveType ?? rawFile?.curveType ?? null,
			curveTypeConfidence:
				processedFile.curveTypeConfidence ?? rawFile?.curveTypeConfidence,
			curveTypeNeedsTemplate:
				processedFile.curveTypeNeedsTemplate ?? rawFile?.curveTypeNeedsTemplate,
			curveTypeReasons: processedFile.curveTypeReasons ?? rawFile?.curveTypeReasons,
		});
	}

	return files;
};

export const resolveExplorerSelectedFileId = (
	selectedFileId: string | null,
	fileIds: readonly string[],
): string | null => {
	const candidates = getNormalizedExplorerFileIds(fileIds);
	const normalizedSelectedFileId = normalizeExplorerFileId(selectedFileId);
	if (normalizedSelectedFileId && candidates.includes(normalizedSelectedFileId)) {
		return normalizedSelectedFileId;
	}

	return candidates[0] ?? null;
};

export const resolveExplorerSelectionAfterRemoval = ({
	currentFileId,
	remainingFileIds,
	removedFileIds,
}: {
	readonly currentFileId: string | null;
	readonly remainingFileIds: readonly string[];
	readonly removedFileIds: readonly string[];
}): string | null => {
	const removed = new Set(getNormalizedExplorerFileIds(removedFileIds));
	const remaining = getNormalizedExplorerFileIds(remainingFileIds)
		.filter(fileId => !removed.has(fileId));
	const current = normalizeExplorerFileId(currentFileId);
	if (!current) {
		return null;
	}

	return removed.has(current)
		? remaining[0] ?? null
		: resolveExplorerSelectedFileId(current, remaining);
};

export const getNormalizedExplorerFileIds = (
	fileIds: readonly string[],
): readonly string[] => {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const fileId of fileIds) {
		const normalized = normalizeExplorerFileId(fileId);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		seen.add(normalized);
		result.push(normalized);
	}

	return result;
};

const normalizeExplorerFileId = (fileId: unknown): string | null => {
	const normalized = String(fileId ?? "").trim();
	return normalized || null;
};
