import {
  isEqualOrParent as isPathEqualOrParent,
  toSlashes,
} from "src/cs/base/common/extpath";
import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";

export type FileTreeNode = {
  readonly children?: FileTreeNode[];
  readonly entry?: FileEntry;
  readonly key: string;
  readonly kind: "folder" | "file";
  readonly name: string;
};

type MutableFileTreeNode = {
  children?: MutableFileTreeNode[];
  entry?: FileEntry;
  key: string;
  kind: "folder" | "file";
  name: string;
};

const normalizePath = (value: unknown): string[] =>
  toSlashes(String(value ?? ""))
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

const getFileName = (entry: FileEntry): string => {
  if (
    entry.file &&
    typeof entry.file === "object" &&
    "name" in entry.file
  ) {
    return String(entry.file.name ?? "");
  }

  return String(entry.fileName ?? "");
};

const compareTreeNodes = (
  first: MutableFileTreeNode,
  second: MutableFileTreeNode,
): number => {
  if (first.kind !== second.kind) {
    return first.kind === "folder" ? -1 : 1;
  }

  return first.name.localeCompare(second.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const freezeTreeNode = (node: MutableFileTreeNode): FileTreeNode => ({
  children: node.children?.sort(compareTreeNodes).map(freezeTreeNode),
  entry: node.entry,
  key: node.key,
  kind: node.kind,
  name: node.name,
});

export const getTreeFileName = getFileName;

export const buildFileTree = (
  entries: FileEntry[],
): FileTreeNode[] => {
  const roots: MutableFileTreeNode[] = [];
  const folders = new Map<string, MutableFileTreeNode>();

  for (const entry of entries) {
    const fileName = getFileName(entry);
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

  return roots.sort(compareTreeNodes).map(freezeTreeNode);
};

export const collectFileTreeFolderKeys = (
  nodes: FileTreeNode[],
): string[] => {
  const keys: string[] = [];

  const visit = (node: FileTreeNode) => {
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

export const getFileTreeFolderPath = (folderKey: unknown): string | null => {
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
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");

export const isFileTreePathInFolder = (
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
