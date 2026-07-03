/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "../../../base/common/event.js";
import type { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import type { IWorkspaceIdentifier } from "./workspaceIdentifier.js";

export const IWorkspacesService = createDecorator<IWorkspacesService>("workspacesService");

export interface IWorkspacesService {
  readonly _serviceBrand: undefined;

  enterWorkspace(workspaceUri: URI): Promise<IEnterWorkspaceResult | undefined>;
  createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier>;
  deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void>;
  getWorkspaceIdentifier(workspaceUri: URI): Promise<IWorkspaceIdentifier>;

  readonly onDidChangeRecentlyOpened: Event<void>;
  addRecentlyOpened(recents: IRecent[]): Promise<void>;
  removeRecentlyOpened(workspaces: URI[]): Promise<void>;
  clearRecentlyOpened(): Promise<void>;
  getRecentlyOpened(): Promise<IRecentlyOpened>;
}

export interface IRecentlyOpened {
  readonly workspaces: Array<IRecentWorkspace | IRecentFolder>;
  readonly files: IRecentFile[];
}

export type IRecent = IRecentWorkspace | IRecentFolder | IRecentFile;

export interface IRecentWorkspace {
  readonly workspace: IWorkspaceIdentifier;
  readonly label?: string;
  readonly remoteAuthority?: string;
}

export interface IRecentFolder {
  readonly folderUri: URI;
  readonly label?: string;
  readonly remoteAuthority?: string;
}

export interface IRecentFile {
  readonly fileUri: URI;
  readonly label?: string;
  readonly remoteAuthority?: string;
}

export function isRecentWorkspace(curr: IRecent): curr is IRecentWorkspace {
  return Object.prototype.hasOwnProperty.call(curr, "workspace");
}

export function isRecentFolder(curr: IRecent): curr is IRecentFolder {
  return Object.prototype.hasOwnProperty.call(curr, "folderUri");
}

export function isRecentFile(curr: IRecent): curr is IRecentFile {
  return Object.prototype.hasOwnProperty.call(curr, "fileUri");
}

export interface IWorkspaceFolderCreationData {
  readonly uri: URI;
  readonly name?: string;
}

export interface IUntitledWorkspaceInfo {
  readonly workspace: IWorkspaceIdentifier;
  readonly remoteAuthority?: string;
}

export interface IEnterWorkspaceResult {
  readonly workspace: IWorkspaceIdentifier;
  readonly backupPath?: string;
}
