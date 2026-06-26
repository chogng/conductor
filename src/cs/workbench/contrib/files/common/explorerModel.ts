/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	isEqualOrParent as isPathEqualOrParent,
	toSlashes,
} from "src/cs/base/common/extpath";
import type { URI } from "src/cs/base/common/uri";
import type {
	FileId,
	FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	collectFileRecordBaseCurves,
	collectFileRecordMeasurementBlocks,
	getFileRecordAxisProjection,
	getFileRecordCurveType,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import {
	ExplorerFileNestingTrie,
	type ExplorerFileNestingPattern,
} from "src/cs/workbench/contrib/files/common/explorerFileNestingTrie";
import {
	createRawTableStatusSignature,
	type RawTableExplorerStatus,
} from "src/cs/workbench/contrib/files/common/rawTableStatusProjection";

export type ExplorerSourceStatus = "pending" | "preparing" | "failed";

export type ExplorerFileEntry = {
	readonly chartMessage?: string | null;
	readonly chartState?: "none" | "queued" | "processing" | "ready" | "failed" | "skipped";
	readonly file?: unknown;
	readonly fileId?: string;
	readonly fileName?: string;
	readonly hasChartData?: boolean;
	readonly itemKey?: string;
	readonly localImport?: boolean;
	readonly normalizedCsvPath?: string | null;
	readonly rawTableStatus?: RawTableExplorerStatus;
	readonly relativePath?: string | null;
	readonly resource?: URI | null;
	readonly sheetId?: string | null;
	readonly sheetName?: string | null;
	readonly sourcePath?: string | null;
	readonly sourceStatus?: ExplorerSourceStatus;
	readonly sourceStatusMessage?: string | null;
	readonly rawTableHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
	readonly rawTableHealthMessage?: string | null;
	readonly templateEligibility?: "eligible" | "notEligible" | "needsUserAction";
	readonly fileVersion?: number;
	readonly curveType?: string | null;
	readonly curveTypeConfidence?: "high" | "medium" | "low";
	readonly curveTypeNeedsReview?: boolean;
	readonly curveTypeReasons?: readonly string[];
};

export type ExplorerCurveTypeConfidence = "high" | "medium" | "low";

export type ExplorerXAxisRole = "vg" | "vd" | null;

export type ExplorerXAxisRoleSource =
	| "filename"
	| "hint"
	| "label"
	| "metadata"
	| "shape"
	| null;

export type ExplorerSemanticProjection = {
	readonly curveType?: string | null;
	readonly curveTypeConfidence?: ExplorerCurveTypeConfidence;
	readonly curveTypeNeedsReview?: boolean;
	readonly curveTypeReasons?: readonly string[];
};

export type ExplorerRawFileProjection = ExplorerSemanticProjection & {
	readonly file?: unknown;
	readonly fileId?: string;
	readonly fileName?: string;
	readonly itemKey?: string | null;
	readonly normalizedCsvPath?: string | null;
	readonly rawTableHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
	readonly rawTableHealthMessage?: string | null;
	readonly relativePath?: string | null;
	readonly sourcePath?: string | null;
	readonly sourceVersion?: number;
	readonly tableKey?: string | null;
	readonly templateEligibility?: "eligible" | "notEligible" | "needsUserAction";
	readonly xAxisRole?: ExplorerXAxisRole;
	readonly xAxisRoleSource?: ExplorerXAxisRoleSource;
};

export type ExplorerThumbnailFile = Omit<ExplorerSemanticProjection, "curveType"> & {
	readonly calculationCache?: unknown;
	readonly curveFilterField?: string | null;
	readonly curveFilterKey?: string | null;
	readonly curveType?: string;
	readonly domain?: {
		readonly x?: readonly [number, number];
		readonly y?: readonly [number, number];
	};
	readonly fileId?: string;
	readonly fileName?: string;
	readonly series?: readonly unknown[];
	readonly supportsSs?: boolean;
	readonly x?: {
		readonly sampledPoints?: number | null;
	};
	readonly xAxisRole?: ExplorerXAxisRole;
	readonly xAxisRoleSource?: ExplorerXAxisRoleSource;
	readonly xGroups?: readonly unknown[];
	readonly xUnit?: string;
	readonly yUnit?: string;
};

export type ExplorerFilePresentationSignatureOptions = {
	readonly badgeColorSignature: string;
	readonly isEditing: boolean;
	readonly templateLabel: string;
	readonly templateSelectionId: string;
};

export type ExplorerTreeNode<TEntry extends ExplorerFileEntry = ExplorerFileEntry> = {
	readonly children?: ExplorerTreeNode<TEntry>[];
	readonly entry?: TEntry;
	readonly key: string;
	readonly kind: "folder" | "file";
	readonly name: string;
};

export type ExplorerTreeOptions = {
	readonly fileNestingPatterns?: readonly ExplorerFileNestingPattern[];
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

export const getExplorerTreeFileKey = <TEntry extends ExplorerFileEntry>(
	entry: TEntry,
	pathParts?: readonly string[],
): string =>
	entry.itemKey ?? entry.fileId ?? `file:${(pathParts ?? [
		...normalizePath(entry.relativePath),
	]).join("/") || getExplorerFileName(entry)}`;

export const createExplorerFilePresentationSignature = (
	entry: ExplorerFileEntry,
	options: ExplorerFilePresentationSignatureOptions,
): string => {
	return [
		entry.fileId ?? "",
		entry.sourceStatus ?? "",
		entry.sourceStatusMessage ?? "",
		createRawTableStatusSignature(entry.rawTableStatus),
		entry.rawTableHealth ?? "",
		entry.rawTableHealthMessage ?? "",
		entry.templateEligibility ?? "",
		entry.curveType ?? "",
		entry.curveTypeConfidence ?? "",
		entry.curveTypeNeedsReview === true ? "1" : "0",
		(entry.curveTypeReasons ?? []).join("\u001d"),
		options.badgeColorSignature,
		options.templateLabel,
		options.templateSelectionId,
		options.isEditing ? "editing" : "",
	].join("\u001f");
};

export const createExplorerTreeStructureSignature = (
	files: readonly ExplorerFileEntry[],
): string =>
	files
		.map((entry) => [
			entry.fileId ?? "",
			entry.itemKey ?? "",
			entry.relativePath ?? "",
			getExplorerFileName(entry),
		].join("\u001f"))
		.join("\u001e");

export const buildExplorerTree = <TEntry extends ExplorerFileEntry>(
	entries: readonly TEntry[],
	options: ExplorerTreeOptions = {},
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
		const fileKey = getExplorerTreeFileKey(entry, pathParts);
		children.push({
			entry,
			key: fileKey,
			kind: "file",
			name: leafName,
		});
	}

	applyExplorerFileNesting(roots, options.fileNestingPatterns);
	return roots.sort(compareExplorerTreeNodes).map(freezeExplorerTreeNode);
};

const applyExplorerFileNesting = <TEntry extends ExplorerFileEntry>(
	nodes: MutableExplorerTreeNode<TEntry>[],
	patterns: readonly ExplorerFileNestingPattern[] | undefined,
	dirname = "",
): void => {
	if (!patterns?.length) {
		return;
	}

	const fileNodes = nodes.filter(node => node.kind === "file");
	if (fileNodes.length > 1) {
		nestExplorerFileNodes(nodes, fileNodes, patterns, dirname);
	}

	for (const node of nodes) {
		if (node.kind !== "folder" || !node.children?.length) {
			continue;
		}

		const childDirname = dirname ? `${dirname}/${node.name}` : node.name;
		applyExplorerFileNesting(node.children, patterns, childDirname);
	}
};

const nestExplorerFileNodes = <TEntry extends ExplorerFileEntry>(
	nodes: MutableExplorerTreeNode<TEntry>[],
	fileNodes: readonly MutableExplorerTreeNode<TEntry>[],
	patterns: readonly ExplorerFileNestingPattern[],
	dirname: string,
): void => {
	const nodesByName = new Map<string, MutableExplorerTreeNode<TEntry>[]>();
	for (const node of fileNodes) {
		const existing = nodesByName.get(node.name);
		if (existing) {
			existing.push(node);
		} else {
			nodesByName.set(node.name, [node]);
		}
	}

	const nesting = new ExplorerFileNestingTrie(patterns).nest(
		[...nodesByName.keys()],
		dirname,
	);
	const nestedNodes = new Set<MutableExplorerTreeNode<TEntry>>();

	for (const [parentName, childNames] of nesting.entries()) {
		const parent = nodesByName.get(parentName)?.[0];
		if (!parent || childNames.size === 0) {
			continue;
		}

		for (const childName of childNames) {
			const child = nodesByName.get(childName)?.[0];
			if (!child || child === parent || nestedNodes.has(child)) {
				continue;
			}

			if (!parent.children) {
				parent.children = [];
			}
			parent.children.push(child);
			nestedNodes.add(child);
		}
	}

	if (nestedNodes.size === 0) {
		return;
	}

	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		if (nestedNodes.has(nodes[index])) {
			nodes.splice(index, 1);
		}
	}
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
	processedFile: ExplorerThumbnailFile,
	rawFile: ExplorerRawFileProjection | undefined,
	fileId: string,
): string =>
	String(processedFile.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId;

const getOptionalString = (value: unknown): string | undefined => {
	const text = String(value ?? "").trim();
	return text || undefined;
};

const hasFileRecordChartData = (file: FileRecord): boolean =>
	collectFileRecordBaseCurves(file).length > 0 ||
	collectFileRecordMeasurementBlocks(file).length > 0;

const createExplorerHealthFields = (
	file: Pick<
		ExplorerRawFileProjection,
		"rawTableHealth" | "rawTableHealthMessage" | "templateEligibility"
	> | undefined,
): Pick<
	ExplorerFileEntry,
	"rawTableHealth" | "rawTableHealthMessage" | "templateEligibility"
> => ({
	...(file?.rawTableHealth ? { rawTableHealth: file.rawTableHealth } : {}),
	...(file?.rawTableHealthMessage ? { rawTableHealthMessage: file.rawTableHealthMessage } : {}),
	...(file?.templateEligibility ? { templateEligibility: file.templateEligibility } : {}),
});

const getExplorerFileVersion = (
	value: unknown,
): number | undefined => {
	const version = Math.floor(Number(value));
	return Number.isFinite(version) && version >= 0 ? version : undefined;
};

const getFileRecordVersion = (
	file: FileRecord,
	fallback: unknown,
): number | undefined => {
	const versions = Object.values(file.rawTableVersionsById ?? {})
		.map(value => getExplorerFileVersion(value))
		.filter((value): value is number => typeof value === "number");
	if (!versions.length) {
		return getExplorerFileVersion(fallback);
	}

	return Math.max(...versions);
};

export const createRawExplorerFiles = (
	rawFiles: readonly ExplorerRawFileProjection[],
): ExplorerFileEntry[] =>
	rawFiles.map(file => ({
		file: file.file,
		fileId: file.fileId,
		fileName: file.fileName,
		normalizedCsvPath: file.normalizedCsvPath,
		relativePath: file.relativePath ?? null,
		itemKey: getOptionalString(file.itemKey ?? file.tableKey),
		sourcePath: file.sourcePath,
		...createExplorerHealthFields(file),
		fileVersion: getExplorerFileVersion(file.sourceVersion),
		curveType: file.curveType ?? null,
		curveTypeConfidence: file.curveTypeConfidence,
		curveTypeNeedsReview: file.curveTypeNeedsReview,
		curveTypeReasons: file.curveTypeReasons,
	}));

export const createChartExplorerFilesFromRecords = (
	filesById: Record<FileId, FileRecord>,
	fileOrder: readonly FileId[],
	rawFiles: readonly ExplorerRawFileProjection[] = [],
): ExplorerFileEntry[] => {
	const rawFileById = new Map<string, ExplorerRawFileProjection>();
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
		if (!file || !hasFileRecordChartData(file)) {
			return;
		}

		const rawFile = rawFileById.get(fileId);
		const curveType = getFileRecordCurveType(file) ?? rawFile?.curveType ?? null;
		const xAxisRole = getFileRecordAxisProjection(file).xAxisRole ??
			rawFile?.xAxisRole ??
			null;
		files.push({
			chartState: "ready",
			file: file.raw.file ?? rawFile?.file,
			fileId,
			fileName: String(file.name ?? file.raw.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId,
			hasChartData: true,
			normalizedCsvPath: file.raw.normalizedCsvPath ?? rawFile?.normalizedCsvPath,
			relativePath: file.raw.relativePath ?? rawFile?.relativePath ?? null,
			itemKey: getOptionalString(rawFile?.itemKey ?? rawFile?.tableKey ?? file.raw.rawKey),
			sourcePath: file.raw.filePath ?? rawFile?.sourcePath,
			...createExplorerHealthFields(rawFile),
			fileVersion: getFileRecordVersion(file, rawFile?.sourceVersion),
			curveType,
			curveTypeConfidence: rawFile?.curveTypeConfidence,
			curveTypeNeedsReview: rawFile?.curveTypeNeedsReview,
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
	rawFiles: readonly ExplorerRawFileProjection[],
	processedFiles: readonly ExplorerThumbnailFile[],
): ExplorerFileEntry[] => {
	const rawFileById = new Map<string, ExplorerRawFileProjection>();
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
		const curveType = processedFile.curveType ?? rawFile?.curveType ?? null;
		const xAxisRole = processedFile.xAxisRole ?? rawFile?.xAxisRole ?? null;
		files.push({
			chartState: "ready",
			file: rawFile?.file,
			fileId,
			fileName: getFileName(processedFile, rawFile, fileId),
			hasChartData: true,
			normalizedCsvPath: rawFile?.normalizedCsvPath,
			relativePath: rawFile?.relativePath ?? null,
			itemKey: getOptionalString(rawFile?.itemKey ?? rawFile?.tableKey),
			sourcePath: rawFile?.sourcePath,
			...createExplorerHealthFields(rawFile),
			fileVersion: getExplorerFileVersion(rawFile?.sourceVersion),
			curveType,
			curveTypeConfidence:
				processedFile.curveTypeConfidence ?? rawFile?.curveTypeConfidence,
			curveTypeNeedsReview:
				processedFile.curveTypeNeedsReview ?? rawFile?.curveTypeNeedsReview,
			curveTypeReasons: processedFile.curveTypeReasons ?? rawFile?.curveTypeReasons,
		});
	}

	return files;
};

export const mergeExplorerSourceEntries = ({
	files,
	pendingSourceEntries,
	replaceItemKeys,
}: {
	readonly files: readonly ExplorerFileEntry[];
	readonly pendingSourceEntries: readonly ExplorerFileEntry[];
	readonly replaceItemKeys?: readonly string[] | null;
}): ExplorerFileEntry[] => {
	if (!pendingSourceEntries.length && !replaceItemKeys?.length) {
		return [...files];
	}

	const pendingByItemKey = mapExplorerFilesByItemKey(pendingSourceEntries);
	const committedByItemKey = mapExplorerFilesByItemKey(files);
	if (replaceItemKeys?.length) {
		const result: ExplorerFileEntry[] = [];
		const seenItemKeys = new Set<string>();
		for (const itemKey of replaceItemKeys) {
			if (seenItemKeys.has(itemKey)) {
				continue;
			}
			seenItemKeys.add(itemKey);
			const committed = committedByItemKey.get(itemKey);
			const pending = pendingByItemKey.get(itemKey);
			if (committed) {
				result.push(committed);
			} else if (pending) {
				result.push(pending);
			}
		}

		return result;
	}

	const committedItemKeys = new Set(committedByItemKey.keys());
	return [
		...files,
		...pendingSourceEntries.filter(entry => {
			const itemKey = normalizeExplorerItemKey(entry.itemKey);
			return !itemKey || !committedItemKeys.has(itemKey);
		}),
	];
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

const normalizeExplorerItemKey = (itemKey: unknown): string | null => {
	const normalized = String(itemKey ?? "").trim();
	return normalized || null;
};

const mapExplorerFilesByItemKey = (
	files: readonly ExplorerFileEntry[],
): Map<string, ExplorerFileEntry> => {
	const result = new Map<string, ExplorerFileEntry>();
	for (const file of files) {
		const itemKey = normalizeExplorerItemKey(file.itemKey);
		if (!itemKey || result.has(itemKey)) {
			continue;
		}
		result.set(itemKey, file);
	}
	return result;
};
