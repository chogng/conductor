/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	isEqualOrParent as isPathEqualOrParent,
	toSlashes,
} from "src/cs/base/common/extpath";

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
