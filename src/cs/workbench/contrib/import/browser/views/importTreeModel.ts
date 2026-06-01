import type { ImporterFileEntry } from "src/cs/workbench/contrib/import/common/types";

export type ImportTreeNode = {
  readonly children?: ImportTreeNode[];
  readonly entry?: ImporterFileEntry;
  readonly key: string;
  readonly kind: "folder" | "file";
  readonly name: string;
};

type MutableImportTreeNode = {
  children?: MutableImportTreeNode[];
  entry?: ImporterFileEntry;
  key: string;
  kind: "folder" | "file";
  name: string;
};

const normalizeImportPath = (value: unknown): string[] =>
  String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

const getFileName = (entry: ImporterFileEntry): string => {
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
  first: MutableImportTreeNode,
  second: MutableImportTreeNode,
): number => {
  if (first.kind !== second.kind) {
    return first.kind === "folder" ? -1 : 1;
  }

  return first.name.localeCompare(second.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const freezeTreeNode = (node: MutableImportTreeNode): ImportTreeNode => ({
  children: node.children?.sort(compareTreeNodes).map(freezeTreeNode),
  entry: node.entry,
  key: node.key,
  kind: node.kind,
  name: node.name,
});

export const getImportTreeFileName = getFileName;

export const buildImportTree = (
  entries: ImporterFileEntry[],
): ImportTreeNode[] => {
  const roots: MutableImportTreeNode[] = [];
  const folders = new Map<string, MutableImportTreeNode>();

  for (const entry of entries) {
    const fileName = getFileName(entry);
    const parts = normalizeImportPath(entry.relativePath);
    const pathParts = parts.length > 0 ? parts : [fileName];
    let children = roots;
    let currentPath = "";

    for (let index = 0; index < pathParts.length - 1; index += 1) {
      const part = pathParts[index];
      if (!part) continue;

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

export const collectImportTreeFolderKeys = (
  nodes: ImportTreeNode[],
): string[] => {
  const keys: string[] = [];

  const visit = (node: ImportTreeNode) => {
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
