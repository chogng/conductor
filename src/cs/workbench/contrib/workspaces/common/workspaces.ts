import { toSlashes } from "src/cs/base/common/extpath";

export const ADD_WORKSPACE_FOLDER_COMMAND_ID = "workspaces.addFolder";
export const WORKSPACE_EXTERNAL_CHANGES_TOAST_ID = "workspaces.externalChanges";

export type WorkspaceExternalChangeKind = "added" | "modified" | "deleted";

export type WorkspaceExternalChange = {
  readonly kind: WorkspaceExternalChangeKind;
  readonly relativePath: string;
  readonly sourceKey?: string | null;
};

export type WorkspaceExternalChanges = {
  readonly added: readonly WorkspaceExternalChange[];
  readonly modified: readonly WorkspaceExternalChange[];
  readonly deleted: readonly WorkspaceExternalChange[];
};

export const createWorkspaceSourcePathKey = (relativePath: unknown): string | null => {
  const normalized = toSlashes(String(relativePath ?? ""))
    .split("/")
    .map(part => part.trim())
    .filter(Boolean)
    .join("/");

  return normalized || null;
};

export const hasWorkspaceExternalChanges = (
  changes: WorkspaceExternalChanges,
): boolean =>
  changes.added.length > 0 ||
  changes.modified.length > 0 ||
  changes.deleted.length > 0;
