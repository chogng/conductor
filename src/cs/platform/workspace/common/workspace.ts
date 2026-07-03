/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "../../../base/common/event.js";
import { extname } from "../../../base/common/path.js";
import { basenameOrAuthority, ExtUri, extname as resourceExtname, joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import type {
  ISingleFolderWorkspaceIdentifier,
  IWorkspaceIdentifier,
} from "../../workspaces/common/workspaceIdentifier.js";

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>("contextService");

export interface IWorkspaceContextService {
  readonly _serviceBrand: undefined;

  /**
   * An event which fires on workbench state changes.
   */
  readonly onDidChangeWorkbenchState: Event<WorkbenchState>;

  /**
   * An event which fires on workspace name changes.
   */
  readonly onDidChangeWorkspaceName: Event<void>;

  /**
   * An event which fires before workspace folders change.
   */
  readonly onWillChangeWorkspaceFolders: Event<IWorkspaceFoldersWillChangeEvent>;

  /**
   * An event which fires on workspace folders change.
   */
  readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent>;

  /**
   * Provides access to the complete workspace object.
   */
  getCompleteWorkspace(): Promise<IWorkspace>;

  /**
   * Provides access to the workspace object the window is running with.
   */
  getWorkspace(): IWorkspace;

  /**
   * Return the state of the workbench.
   */
  getWorkbenchState(): WorkbenchState;

  /**
   * Returns the folder for the given resource from the workspace.
   */
  getWorkspaceFolder(resource: URI): IWorkspaceFolder | null;

  /**
   * Return true if the current workspace has the given identifier or root URI.
   */
  isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean;

  /**
   * Returns if the provided resource is inside the workspace or not.
   */
  isInsideWorkspace(resource: URI): boolean;

  /**
   * Return true if the current workspace has data that can be sent to the extension host.
   */
  hasWorkspaceData(): boolean;
}

export interface IResolvedWorkspace extends IWorkspaceIdentifier, IBaseWorkspace {
  readonly folders: IWorkspaceFolder[];
}

export interface IBaseWorkspace {
  /**
   * If present, marks the window that opens the workspace as a remote window.
   */
  readonly remoteAuthority?: string;

  /**
   * Transient workspaces are meant to go away after being used once.
   */
  readonly transient?: boolean;
}

export const enum WorkbenchState {
  EMPTY = 1,
  FOLDER,
  WORKSPACE,
}

export interface IWorkspaceFoldersWillChangeEvent {
  readonly changes: IWorkspaceFoldersChangeEvent;
  readonly fromCache: boolean;

  join(promise: Promise<void>): void;
}

export interface IWorkspaceFoldersChangeEvent {
  readonly added: IWorkspaceFolder[];
  readonly removed: IWorkspaceFolder[];
  readonly changed: IWorkspaceFolder[];
}

export interface IWorkspace {
  /**
   * The unique identifier of the workspace.
   */
  readonly id: string;

  /**
   * Folders in the workspace.
   */
  readonly folders: IWorkspaceFolder[];

  /**
   * Transient workspaces are meant to go away after being used once.
   */
  readonly transient?: boolean;

  /**
   * The location of the workspace configuration.
   */
  readonly configuration?: URI | null;

  /**
   * Optional display name for the workspace.
   */
  readonly name?: string;
}

export function isWorkspace(thing: unknown): thing is IWorkspace {
  const candidate = thing as IWorkspace | undefined;

  return !!(candidate && typeof candidate === "object"
    && typeof candidate.id === "string"
    && Array.isArray(candidate.folders));
}

export interface IWorkspaceFolderData {
  /**
   * The associated URI for this workspace folder.
   */
  readonly uri: URI;

  /**
   * The name of this workspace folder.
   */
  readonly name: string;

  /**
   * The ordinal number of this workspace folder.
   */
  readonly index: number;
}

export interface IWorkspaceFolder extends IWorkspaceFolderData {
  /**
   * Given a workspace folder relative path, returns the absolute resource URI.
   */
  toResource(relativePath: string): URI;
}

export function isWorkspaceFolder(thing: unknown): thing is IWorkspaceFolder {
  const candidate = thing as IWorkspaceFolder | undefined;

  return !!(candidate && typeof candidate === "object"
    && URI.isUri(candidate.uri)
    && typeof candidate.name === "string"
    && typeof candidate.index === "number"
    && typeof candidate.toResource === "function");
}

export class Workspace implements IWorkspace {
  private _folders: WorkspaceFolder[];

  public constructor(
    private _id: string,
    folders: WorkspaceFolder[],
    private _transient: boolean,
    private _configuration: URI | null,
    private ignorePathCasing: (key: URI) => boolean,
    private _workspaceName?: string,
  ) {
    this._folders = folders;
  }

  public get id(): string {
    return this._id;
  }

  public get folders(): WorkspaceFolder[] {
    return this._folders;
  }

  public set folders(folders: WorkspaceFolder[]) {
    this._folders = folders;
  }

  public get transient(): boolean {
    return this._transient;
  }

  public get configuration(): URI | null {
    return this._configuration;
  }

  public set configuration(configuration: URI | null) {
    this._configuration = configuration;
  }

  public get name(): string | undefined {
    return this._workspaceName;
  }

  public update(workspace: Workspace): void {
    this._id = workspace.id;
    this._configuration = workspace.configuration;
    this._transient = workspace.transient;
    this._workspaceName = workspace.name;
    this.ignorePathCasing = workspace.ignorePathCasing;
    this.folders = workspace.folders;
  }

  public getFolder(resource: URI): IWorkspaceFolder | null {
    let folderCandidate: WorkspaceFolder | null = null;
    const extUri = new ExtUri(this.ignorePathCasing);

    for (const folder of this.folders) {
      if (!extUri.isEqualOrParent(resource, folder.uri)) {
        continue;
      }

      if (!folderCandidate || folder.uri.path.length > folderCandidate.uri.path.length) {
        folderCandidate = folder;
      }
    }

    return folderCandidate;
  }

  public toJSON(): IWorkspace {
    return {
      id: this.id,
      folders: this.folders,
      transient: this.transient,
      configuration: this.configuration,
      name: this.name,
    };
  }
}

export interface IRawFileWorkspaceFolder {
  readonly path: string;
  readonly name?: string;
}

export interface IRawUriWorkspaceFolder {
  readonly uri: string;
  readonly name?: string;
}

export class WorkspaceFolder implements IWorkspaceFolder {
  public readonly uri: URI;
  public readonly name: string;
  public readonly index: number;

  public constructor(
    data: IWorkspaceFolderData,
    /**
     * Provides access to the original metadata for this workspace folder.
     */
    public readonly raw?: IRawFileWorkspaceFolder | IRawUriWorkspaceFolder,
  ) {
    this.uri = data.uri;
    this.index = data.index;
    this.name = data.name;
  }

  public toResource(relativePath: string): URI {
    return joinPath(this.uri, relativePath);
  }

  public toJSON(): IWorkspaceFolderData {
    return { uri: this.uri, name: this.name, index: this.index };
  }
}

export function toWorkspaceFolder(resource: URI): WorkspaceFolder {
  return new WorkspaceFolder(
    { uri: resource, index: 0, name: basenameOrAuthority(resource) },
    { uri: resource.toString() },
  );
}

export const WORKSPACE_EXTENSION = "code-workspace";
export const WORKSPACE_SUFFIX = `.${WORKSPACE_EXTENSION}`;
export const UNTITLED_WORKSPACE_NAME = "workspace.json";
export const STANDALONE_EDITOR_WORKSPACE_ID = "4064f6ec-cb38-4ad0-af64-ee6467e63c82";

export function isTemporaryWorkspace(workspace: IWorkspace): boolean;
export function isTemporaryWorkspace(path: URI): boolean;
export function isTemporaryWorkspace(arg1: IWorkspace | URI): boolean {
  const path = URI.isUri(arg1) ? arg1 : arg1.configuration;

  return path?.scheme === "tmp";
}

export function isStandaloneEditorWorkspace(workspace: IWorkspace): boolean {
  return workspace.id === STANDALONE_EDITOR_WORKSPACE_ID;
}

export function hasWorkspaceFileExtension(path: string | URI): boolean {
  const candidateExtension = typeof path === "string" ? extname(path) : resourceExtname(path);

  return candidateExtension === WORKSPACE_SUFFIX;
}
