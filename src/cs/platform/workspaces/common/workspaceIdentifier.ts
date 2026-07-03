/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { basename } from "../../../base/common/path.js";
import { URI, type UriComponents } from "../../../base/common/uri.js";
import type { IWorkspace } from "../../workspace/common/workspace.js";

export interface IBaseWorkspaceIdentifier {
  /**
   * Every workspace has a unique identifier.
   */
  readonly id: string;
}

/**
 * A single folder workspace identifier is a folder URI plus id.
 */
export interface ISingleFolderWorkspaceIdentifier extends IBaseWorkspaceIdentifier {
  /**
   * Folder path as URI.
   */
  readonly uri: URI;
}

/**
 * A multi-root workspace identifier is a workspace file URI plus id.
 */
export interface IWorkspaceIdentifier extends IBaseWorkspaceIdentifier {
  /**
   * Workspace configuration file path as URI.
   */
  readonly configPath: URI;
}

export interface IEmptyWorkspaceIdentifier extends IBaseWorkspaceIdentifier {}

export type IAnyWorkspaceIdentifier =
  | IWorkspaceIdentifier
  | ISingleFolderWorkspaceIdentifier
  | IEmptyWorkspaceIdentifier;

export interface ISerializedSingleFolderWorkspaceIdentifier extends IBaseWorkspaceIdentifier {
  readonly uri: UriComponents;
}

export interface ISerializedWorkspaceIdentifier extends IBaseWorkspaceIdentifier {
  readonly configPath: UriComponents;
}

export const EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE: IEmptyWorkspaceIdentifier = { id: "ext-dev" };
export const UNKNOWN_EMPTY_WINDOW_WORKSPACE: IEmptyWorkspaceIdentifier = { id: "empty-window" };

export function isWorkspaceIdentifier(obj: unknown): obj is IWorkspaceIdentifier {
  const workspaceIdentifier = obj as IWorkspaceIdentifier | undefined;

  return typeof workspaceIdentifier?.id === "string" && URI.isUri(workspaceIdentifier.configPath);
}

export function isSingleFolderWorkspaceIdentifier(obj: unknown): obj is ISingleFolderWorkspaceIdentifier {
  const singleFolderIdentifier = obj as ISingleFolderWorkspaceIdentifier | undefined;

  return typeof singleFolderIdentifier?.id === "string" && URI.isUri(singleFolderIdentifier.uri);
}

export function isEmptyWorkspaceIdentifier(obj: unknown): obj is IEmptyWorkspaceIdentifier {
  const emptyWorkspaceIdentifier = obj as IEmptyWorkspaceIdentifier | undefined;

  return typeof emptyWorkspaceIdentifier?.id === "string"
    && !isSingleFolderWorkspaceIdentifier(obj)
    && !isWorkspaceIdentifier(obj);
}

export function toWorkspaceIdentifier(workspace: IWorkspace): IAnyWorkspaceIdentifier;
export function toWorkspaceIdentifier(backupPath: string | undefined, isExtensionDevelopment: boolean): IEmptyWorkspaceIdentifier;
export function toWorkspaceIdentifier(
  arg0: IWorkspace | string | undefined,
  isExtensionDevelopment?: boolean,
): IAnyWorkspaceIdentifier {
  if (typeof arg0 === "string") {
    return { id: basename(arg0) };
  }

  if (typeof arg0 === "undefined") {
    if (isExtensionDevelopment) {
      return EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE;
    }

    return UNKNOWN_EMPTY_WINDOW_WORKSPACE;
  }

  if (arg0.configuration) {
    return {
      id: arg0.id,
      configPath: arg0.configuration,
    };
  }

  if (arg0.folders.length === 1) {
    return {
      id: arg0.id,
      uri: arg0.folders[0].uri,
    };
  }

  return { id: arg0.id };
}

export function reviveIdentifier(identifier: undefined): undefined;
export function reviveIdentifier(identifier: ISerializedWorkspaceIdentifier): IWorkspaceIdentifier;
export function reviveIdentifier(identifier: ISerializedSingleFolderWorkspaceIdentifier): ISingleFolderWorkspaceIdentifier;
export function reviveIdentifier(identifier: IEmptyWorkspaceIdentifier): IEmptyWorkspaceIdentifier;
export function reviveIdentifier(
  identifier: ISerializedWorkspaceIdentifier
    | ISerializedSingleFolderWorkspaceIdentifier
    | IEmptyWorkspaceIdentifier
    | undefined,
): IAnyWorkspaceIdentifier | undefined;
export function reviveIdentifier(
  identifier: ISerializedWorkspaceIdentifier
    | ISerializedSingleFolderWorkspaceIdentifier
    | IEmptyWorkspaceIdentifier
    | undefined,
): IAnyWorkspaceIdentifier | undefined {
  const singleFolderIdentifierCandidate = identifier as ISerializedSingleFolderWorkspaceIdentifier | undefined;
  if (singleFolderIdentifierCandidate?.uri) {
    return {
      id: singleFolderIdentifierCandidate.id,
      uri: URI.revive(singleFolderIdentifierCandidate.uri),
    };
  }

  const workspaceIdentifierCandidate = identifier as ISerializedWorkspaceIdentifier | undefined;
  if (workspaceIdentifierCandidate?.configPath) {
    return {
      id: workspaceIdentifierCandidate.id,
      configPath: URI.revive(workspaceIdentifierCandidate.configPath),
    };
  }

  if (identifier?.id) {
    return { id: identifier.id };
  }

  return undefined;
}
