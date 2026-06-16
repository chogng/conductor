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
	getFileRecordAxisProjection,
	getFileRecordCurveType,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import {
	ExplorerFileNestingTrie,
	type ExplorerFileNestingPattern,
} from "src/cs/workbench/contrib/files/common/explorerFileNestingTrie";

export type ExplorerSourceStatus = "pending" | "preparing" | "failed";

export type ExplorerBadgeLabel =
	| "transfer"
	| "output"
	| "cv"
	| "cf"
	| "pv"
	| "mixed";

export type ExplorerBadgeState =
	| {
			readonly confidence: "tentative" | "confirmed";
			readonly kind: "ready";
			readonly label: ExplorerBadgeLabel;
			readonly message?: string | null;
			readonly source: "fast" | "assessment";
		}
	| { readonly kind: "pending" }
	| { readonly kind: "none" }
	| { readonly kind: "unknown"; readonly source: "assessment" }
	| { readonly kind: "error"; readonly message?: string | null };

export type ExplorerFileEntry = {
	readonly file?: unknown;
	readonly fileId?: string;
	readonly fileName?: string;
	readonly itemKey?: string;
	readonly normalizedCsvPath?: string | null;
	readonly relativePath?: string | null;
	readonly sourceKey?: string;
	readonly sourcePath?: string | null;
	readonly sourceStatus?: ExplorerSourceStatus;
	readonly sourceStatusMessage?: string | null;
	readonly badgeState?: ExplorerBadgeState;
	readonly fileVersion?: number;
	readonly curveType?: string | null;
	readonly curveTypeBadgeLabel?: string | null;
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
		const fileKey = entry.fileId ?? entry.itemKey ?? `file:${pathParts.join("/")}`;
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
	processedFile: ProcessedEntry,
	rawFile: SessionFile | undefined,
	fileId: string,
): string =>
	String(processedFile.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId;

const getOptionalString = (value: unknown): string | undefined => {
	const text = String(value ?? "").trim();
	return text || undefined;
};

const getOptionalNullableString = (value: unknown): string | null => {
	const text = String(value ?? "").trim();
	return text || null;
};

const getExplorerCurveTypeBadgeLabel = (
	curveType: unknown,
	xAxisRole: SessionFile["xAxisRole"],
): string | null => {
	const normalizedCurveType = getOptionalNullableString(curveType);
	if (!normalizedCurveType) {
		return null;
	}
	if (xAxisRole === "vg") {
		return "transfer";
	}
	if (xAxisRole === "vd") {
		return "output";
	}
	return normalizedCurveType;
};

export const toExplorerBadgeLabel = (
	value: unknown,
): ExplorerBadgeLabel | null => {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) {
		return null;
	}

	if (normalized.includes("transfer")) {
		return "transfer";
	}
	if (normalized.includes("output")) {
		return "output";
	}
	if (normalized === "cv" || normalized.includes("capacitance-voltage")) {
		return "cv";
	}
	if (normalized === "cf" || normalized.includes("capacitance-frequency")) {
		return "cf";
	}
	if (normalized === "pv" || normalized.includes("photovoltaic")) {
		return "pv";
	}
	if (normalized === "iv" || normalized.includes("id-v")) {
		return "mixed";
	}
	if (normalized === "mixed") {
		return "mixed";
	}

	return null;
};

const hasFileRecordChartData = (file: FileRecord): boolean =>
	collectFileRecordBaseCurves(file).length > 0;

const hasExplorerAssessmentSummary = (
	file: Pick<
		SessionFile | ProcessedEntry,
		"curveType" | "curveTypeConfidence" | "curveTypeNeedsTemplate" | "curveTypeReasons"
	>,
): boolean =>
	Boolean(
		getOptionalNullableString(file.curveType) ||
			file.curveTypeConfidence ||
			file.curveTypeNeedsTemplate === true ||
			file.curveTypeReasons?.length,
	);

const createExplorerAssessmentBadgeState = (
	file: Pick<
		SessionFile | ProcessedEntry,
		"curveType" | "curveTypeConfidence" | "curveTypeNeedsTemplate" | "curveTypeReasons"
	>,
	xAxisRole?: SessionFile["xAxisRole"],
): ExplorerBadgeState => {
	if (!hasExplorerAssessmentSummary(file)) {
		return { kind: "pending" };
	}

	const curveType = getOptionalNullableString(file.curveType);
	if (!curveType || curveType.toLowerCase() === "unknown") {
		return { kind: "unknown", source: "assessment" };
	}

	const label = toExplorerBadgeLabel(
		getExplorerCurveTypeBadgeLabel(curveType, xAxisRole ?? null),
	);
	return label
		? {
				confidence: "confirmed",
				kind: "ready",
				label,
				source: "assessment",
			}
		: { kind: "unknown", source: "assessment" };
};

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
	rawFiles: readonly SessionFile[],
): ExplorerFileEntry[] =>
	rawFiles.map(file => ({
		file: file.file,
		fileId: file.fileId,
		fileName: file.fileName,
		itemKey: getOptionalString(file.itemKey),
		normalizedCsvPath: file.normalizedCsvPath,
		relativePath: file.relativePath ?? null,
		sourceKey: getOptionalString(file.sourceKey),
		sourcePath: file.sourcePath,
		badgeState: createExplorerAssessmentBadgeState(file, file.xAxisRole),
		fileVersion: getExplorerFileVersion(file.sourceVersion),
		curveType: file.curveType ?? null,
		curveTypeBadgeLabel: getExplorerCurveTypeBadgeLabel(
			file.curveType,
			file.xAxisRole,
		),
		curveTypeConfidence: file.curveTypeConfidence,
		curveTypeNeedsTemplate: file.curveTypeNeedsTemplate,
		curveTypeReasons: file.curveTypeReasons,
	}));

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
		if (!file || !hasFileRecordChartData(file)) {
			return;
		}

		const rawFile = rawFileById.get(fileId);
		const curveType = getFileRecordCurveType(file) ?? rawFile?.curveType ?? null;
		const xAxisRole = getFileRecordAxisProjection(file).xAxisRole ??
			rawFile?.xAxisRole ??
			null;
		files.push({
			file: file.raw.file ?? rawFile?.file,
			fileId,
			fileName: String(file.raw.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId,
			itemKey: getOptionalString(rawFile?.itemKey ?? file.raw.rawKey),
			normalizedCsvPath: file.raw.normalizedCsvPath ?? rawFile?.normalizedCsvPath,
			relativePath: file.raw.relativePath ?? rawFile?.relativePath ?? null,
			sourceKey: getOptionalString(rawFile?.sourceKey ?? file.raw.rawKey),
			sourcePath: file.raw.filePath ?? rawFile?.sourcePath,
			fileVersion: getFileRecordVersion(file, rawFile?.sourceVersion),
			badgeState: createExplorerAssessmentBadgeState({
				curveType,
				curveTypeConfidence: rawFile?.curveTypeConfidence,
				curveTypeNeedsTemplate: rawFile?.curveTypeNeedsTemplate,
				curveTypeReasons: rawFile?.curveTypeReasons,
			}, xAxisRole),
			curveType,
			curveTypeBadgeLabel: getExplorerCurveTypeBadgeLabel(curveType, xAxisRole),
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
		const curveType = processedFile.curveType ?? rawFile?.curveType ?? null;
		const xAxisRole = processedFile.xAxisRole ?? rawFile?.xAxisRole ?? null;
		files.push({
			file: rawFile?.file,
			fileId,
			fileName: getFileName(processedFile, rawFile, fileId),
			itemKey: getOptionalString(rawFile?.itemKey),
			normalizedCsvPath: rawFile?.normalizedCsvPath,
			relativePath: rawFile?.relativePath ?? null,
			sourceKey: getOptionalString(rawFile?.sourceKey),
			sourcePath: rawFile?.sourcePath,
			fileVersion: getExplorerFileVersion(rawFile?.sourceVersion),
			badgeState: createExplorerAssessmentBadgeState({
				curveType,
				curveTypeConfidence:
					processedFile.curveTypeConfidence ?? rawFile?.curveTypeConfidence,
				curveTypeNeedsTemplate:
					processedFile.curveTypeNeedsTemplate ?? rawFile?.curveTypeNeedsTemplate,
				curveTypeReasons: processedFile.curveTypeReasons ?? rawFile?.curveTypeReasons,
			}, xAxisRole),
			curveType,
			curveTypeBadgeLabel: getExplorerCurveTypeBadgeLabel(curveType, xAxisRole),
			curveTypeConfidence:
				processedFile.curveTypeConfidence ?? rawFile?.curveTypeConfidence,
			curveTypeNeedsTemplate:
				processedFile.curveTypeNeedsTemplate ?? rawFile?.curveTypeNeedsTemplate,
			curveTypeReasons: processedFile.curveTypeReasons ?? rawFile?.curveTypeReasons,
		});
	}

	return files;
};

export const mergeExplorerSourceEntries = ({
	files,
	pendingSourceEntries,
	replaceSourceKeys,
}: {
	readonly files: readonly ExplorerFileEntry[];
	readonly pendingSourceEntries: readonly ExplorerFileEntry[];
	readonly replaceSourceKeys?: readonly string[] | null;
}): ExplorerFileEntry[] => {
	if (!pendingSourceEntries.length && !replaceSourceKeys?.length) {
		return [...files];
	}

	const pendingBySourceKey = mapExplorerFilesBySourceKey(pendingSourceEntries);
	const committedBySourceKey = mapExplorerFilesBySourceKey(files);
	if (replaceSourceKeys?.length) {
		const result: ExplorerFileEntry[] = [];
		const seenSourceKeys = new Set<string>();
		for (const sourceKey of replaceSourceKeys) {
			if (seenSourceKeys.has(sourceKey)) {
				continue;
			}
			seenSourceKeys.add(sourceKey);
			const committed = committedBySourceKey.get(sourceKey);
			const pending = pendingBySourceKey.get(sourceKey);
			if (committed) {
				result.push(committed);
			} else if (pending) {
				result.push(pending);
			}
		}

		return result;
	}

	const committedSourceKeys = new Set(committedBySourceKey.keys());
	return [
		...files,
		...pendingSourceEntries.filter(entry => {
			const sourceKey = normalizeExplorerSourceKey(entry.sourceKey);
			return !sourceKey || !committedSourceKeys.has(sourceKey);
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

const normalizeExplorerSourceKey = (sourceKey: unknown): string | null => {
	const normalized = String(sourceKey ?? "").trim();
	return normalized || null;
};

const mapExplorerFilesBySourceKey = (
	files: readonly ExplorerFileEntry[],
): Map<string, ExplorerFileEntry> => {
	const result = new Map<string, ExplorerFileEntry>();
	for (const file of files) {
		const sourceKey = normalizeExplorerSourceKey(file.sourceKey);
		if (!sourceKey || result.has(sourceKey)) {
			continue;
		}
		result.set(sourceKey, file);
	}
	return result;
};
