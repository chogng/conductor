/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IWorkspaceContextService,
	WorkbenchState,
	Workspace,
	toWorkspaceFolder,
	type IWorkspace,
	type IWorkspaceFolder,
	type IWorkspaceFoldersChangeEvent,
	type IWorkspaceFoldersWillChangeEvent,
	type WorkspaceFolder,
} from "src/cs/platform/workspace/common/workspace";
import {
	UNKNOWN_EMPTY_WINDOW_WORKSPACE,
	isSingleFolderWorkspaceIdentifier,
	type IAnyWorkspaceIdentifier,
	type ISingleFolderWorkspaceIdentifier,
	type IWorkspaceIdentifier,
} from "src/cs/platform/workspaces/common/workspaceIdentifier";
import { IStorageService, type IStorageService as IStorageServiceType } from "src/cs/platform/storage/common/storage";
import { IUriIdentityService, type IUriIdentityService as IUriIdentityServiceType } from "src/cs/platform/uriIdentity/common/uriIdentity";

export class WorkspaceContextService extends Disposable implements IWorkspaceContextService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeWorkbenchStateEmitter =
		this._register(new Emitter<WorkbenchState>());
	public readonly onDidChangeWorkbenchState =
		this.onDidChangeWorkbenchStateEmitter.event;

	private readonly onDidChangeWorkspaceNameEmitter =
		this._register(new Emitter<void>());
	public readonly onDidChangeWorkspaceName =
		this.onDidChangeWorkspaceNameEmitter.event;

	private readonly onWillChangeWorkspaceFoldersEmitter =
		this._register(new Emitter<IWorkspaceFoldersWillChangeEvent>());
	public readonly onWillChangeWorkspaceFolders =
		this.onWillChangeWorkspaceFoldersEmitter.event;

	private readonly onDidChangeWorkspaceFoldersEmitter =
		this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	public readonly onDidChangeWorkspaceFolders =
		this.onDidChangeWorkspaceFoldersEmitter.event;

	private readonly workspace: Workspace;
	private workspaceIdentifier: IAnyWorkspaceIdentifier =
		UNKNOWN_EMPTY_WINDOW_WORKSPACE;

	public constructor(
		@IStorageService private readonly storageService: IStorageServiceType,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityServiceType,
	) {
		super();
		this.workspace = new Workspace(
			UNKNOWN_EMPTY_WINDOW_WORKSPACE.id,
			[],
			false,
			null,
			resource => this.uriIdentityService.extUri.ignorePathCasing(resource),
		);
	}

	public async openFolder(folder: URI): Promise<void> {
		const canonicalFolder = this.uriIdentityService.asCanonicalUri(URI.revive(folder));
		const currentFolder = this.workspace.folders[0];
		if (
			currentFolder &&
			this.uriIdentityService.extUri.isEqual(currentFolder.uri, canonicalFolder)
		) {
			return;
		}

		const nextFolder = toWorkspaceFolder(canonicalFolder);
		const nextIdentifier: ISingleFolderWorkspaceIdentifier = {
			id: `folder:${this.uriIdentityService.extUri.getComparisonKey(canonicalFolder)}`,
			uri: canonicalFolder,
		};
		await this.changeWorkspace(nextIdentifier, [nextFolder]);
	}

	public async closeFolder(): Promise<void> {
		if (this.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}

		await this.changeWorkspace(UNKNOWN_EMPTY_WINDOW_WORKSPACE, []);
	}

	public async getCompleteWorkspace(): Promise<IWorkspace> {
		return this.workspace;
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getWorkbenchState(): WorkbenchState {
		return this.workspace.folders.length === 0
			? WorkbenchState.EMPTY
			: WorkbenchState.FOLDER;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return this.workspace.getFolder(URI.revive(resource));
	}

	public isCurrentWorkspace(
		workspaceIdOrFolder:
			| IWorkspaceIdentifier
			| ISingleFolderWorkspaceIdentifier
			| URI,
	): boolean {
		if (URI.isUri(workspaceIdOrFolder)) {
			return Boolean(
				this.workspace.folders[0] &&
				this.uriIdentityService.extUri.isEqual(
					this.workspace.folders[0].uri,
					workspaceIdOrFolder,
				),
			);
		}

		if (workspaceIdOrFolder.id !== this.workspaceIdentifier.id) {
			return false;
		}

		return !isSingleFolderWorkspaceIdentifier(workspaceIdOrFolder) ||
			(
				isSingleFolderWorkspaceIdentifier(this.workspaceIdentifier) &&
				this.uriIdentityService.extUri.isEqual(
					workspaceIdOrFolder.uri,
					this.workspaceIdentifier.uri,
				)
			);
	}

	public isInsideWorkspace(resource: URI): boolean {
		return this.getWorkspaceFolder(resource) !== null;
	}

	public hasWorkspaceData(): boolean {
		return this.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	public getWorkspaceRelativePath(resource: URI): string | null {
		const folder = this.workspace.folders[0];
		const revivedResource = URI.revive(resource);
		if (
			!folder ||
			!this.uriIdentityService.extUri.isEqualOrParent(
				revivedResource,
				folder.uri,
			)
		) {
			return null;
		}

		return this.uriIdentityService.extUri.relativePath(
			folder.uri,
			revivedResource,
		) ?? null;
	}

	public resolveWorkspaceRelativePath(relativePath: string): URI | null {
		const folder = this.workspace.folders[0];
		const normalizedPath = relativePath.trim().replaceAll("\\", "/");
		if (
			!folder ||
			!normalizedPath ||
			normalizedPath === ".." ||
			normalizedPath.startsWith("../") ||
			normalizedPath.startsWith("/")
		) {
			return null;
		}

		return folder.toResource(normalizedPath);
	}

	private async changeWorkspace(
		identifier: IAnyWorkspaceIdentifier,
		folders: readonly WorkspaceFolder[],
	): Promise<void> {
		const previousState = this.getWorkbenchState();
		const previousName = this.workspace.name;
		const previousFolders = [...this.workspace.folders];
		const changes: IWorkspaceFoldersChangeEvent = {
			added: [...folders],
			removed: previousFolders,
			changed: [],
		};
		const joins: Promise<void>[] = [];
		this.onWillChangeWorkspaceFoldersEmitter.fire({
			changes,
			fromCache: false,
			join: promise => joins.push(promise),
		});
		await Promise.all(joins);
		await this.storageService.switchWorkspace(identifier);

		const nextWorkspace = new Workspace(
			identifier.id,
			[...folders],
			false,
			null,
			resource => this.uriIdentityService.extUri.ignorePathCasing(resource),
			folders[0]?.name,
		);
		this.workspace.update(nextWorkspace);
		this.workspaceIdentifier = identifier;

		this.onDidChangeWorkspaceFoldersEmitter.fire(changes);
		const nextState = this.getWorkbenchState();
		if (previousState !== nextState) {
			this.onDidChangeWorkbenchStateEmitter.fire(nextState);
		}
		if (previousName !== this.workspace.name) {
			this.onDidChangeWorkspaceNameEmitter.fire();
		}
	}
}

registerSingleton(
	IWorkspaceContextService,
	WorkspaceContextService,
	InstantiationType.Delayed,
);
