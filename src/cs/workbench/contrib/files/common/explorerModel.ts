/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	isEqualOrParent as isPathEqualOrParent,
	toSlashes,
} from "src/cs/base/common/extpath";
import { URI } from "src/cs/base/common/uri";
import {
	ExplorerFileNestingTrie,
	type ExplorerFileNestingPattern,
} from "src/cs/workbench/contrib/files/common/explorerFileNestingTrie";

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
	readonly relativePath?: string | null;
	readonly resource: URI;
	readonly sheetId?: string | null;
	readonly sheetName?: string | null;
	readonly sourcePath?: string | null;
	readonly fileVersion?: number;
};

export type ExplorerResourceIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
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

export const getExplorerFileSourceIdentityKey = (
	entry: ExplorerFileEntry | null | undefined,
): string | null => {
	if (!entry) {
		return null;
	}

	const resource = URI.revive(entry.resource);
	return `resource:${resource.toString()}\u001f${getExplorerFileResourceSheetKey(entry.sheetId) ?? ""}`;
};

export const getExplorerFileResourceIdentity = (
	entry: ExplorerFileEntry | null | undefined,
): ExplorerResourceIdentity | null => {
	if (!entry) {
		return null;
	}

	const resource = URI.revive(entry.resource);
	const sheetId = normalizeExplorerItemKey(entry?.sheetId);
	return {
		resource,
		...(sheetId ? { sheetId } : {}),
	};
};

export const getExplorerResourceIdentityKey = (
	target:
		| { readonly resource?: URI | null; readonly sheetId?: string | null }
		| null
		| undefined,
): string | null => {
	const resource = target?.resource ? URI.revive(target.resource) : null;
	const resourceIdentity = resource?.toString();
	if (!resourceIdentity) {
		return null;
	}

	return `resource:${resourceIdentity}\u001f${normalizeExplorerItemKey(target?.sheetId) ?? ""}`;
};

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

const getExplorerFileResourceSheetKey = (sheetId: unknown): string | null =>
	normalizeExplorerItemKey(sheetId);

export const filterNewExplorerFiles = (
	entries: readonly ExplorerFileEntry[],
	currentFiles: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] => {
	const seen = new Set(currentFiles.map(getExplorerFileEntryKey));
	const result: ExplorerFileEntry[] = [];
	for (const entry of entries) {
		const key = getExplorerFileEntryKey(entry);
		if (!key || seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(entry);
	}
	return result;
};

export const mergeExplorerCommittedFiles = (
	baseFiles: readonly ExplorerFileEntry[],
	localFiles: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] => {
	if (!baseFiles.length) {
		return [...localFiles];
	}
	if (!localFiles.length) {
		return [...baseFiles];
	}

	const result = [...baseFiles];
	const indexesByKey = new Map<string, number>();
	for (let index = 0; index < result.length; index += 1) {
		const key = getExplorerFileEntryKey(result[index]);
		if (key) {
			indexesByKey.set(key, index);
		}
	}

	for (const file of localFiles) {
		const key = getExplorerFileEntryKey(file);
		const index = key ? indexesByKey.get(key) : undefined;
		if (index === undefined) {
			if (key) {
				indexesByKey.set(key, result.length);
			}
			result.push(file);
			continue;
		}

		result[index] = file;
	}
	return result;
};

export const getExplorerFileEntryKey = (file: ExplorerFileEntry | undefined): string =>
	getExplorerFileSourceIdentityKey(file) ?? "";

const normalizeExplorerItemKey = (itemKey: unknown): string | null => {
	const normalized = String(itemKey ?? "").trim();
	return normalized || null;
};
