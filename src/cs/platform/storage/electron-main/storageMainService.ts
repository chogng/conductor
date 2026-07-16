/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";

import { DisposableStore } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import {
	StorageScope,
	WORKSPACE_STORAGE_FILENAME,
	WORKSPACE_STORAGE_FOLDER_NAME,
	type IStorageService,
} from "../common/storage.js";
import {
	isSingleFolderWorkspaceIdentifier,
	type IAnyWorkspaceIdentifier,
} from "../../workspaces/common/workspaceIdentifier.js";
import { AbstractStorageService } from "../common/storageService.js";
import {
	GLOBAL_STORAGE_DIRECTORY,
	PROFILE_STORAGE_DIRECTORY,
	STORAGE_FILENAME,
	StorageMain,
	type IStorageMain,
} from "./storageMain.js";

const ALL_STORAGE_SCOPES = [
	StorageScope.APPLICATION,
	StorageScope.PROFILE,
	StorageScope.WORKSPACE,
] as const;

export type StorageMainServiceOptions = {
	readonly getHomeDir: () => string;
	readonly profileId: string;
	readonly workspace: IAnyWorkspaceIdentifier;
	readonly logWarning?: (message: string, error?: unknown) => void;
};

export class StorageMainService extends AbstractStorageService implements IStorageService {
	private readonly storages = new Map<StorageScope, IStorageMain>();
	private readonly fixedDisposables = new DisposableStore();
	private readonly workspaceDisposables = new DisposableStore();
	private currentWorkspace: IAnyWorkspaceIdentifier;

	constructor(private readonly options: StorageMainServiceOptions) {
		super();
		this.currentWorkspace = options.workspace;

		const homeDir = options.getHomeDir();
		this.storages.set(
			StorageScope.APPLICATION,
			this.createFixedStorage(
				path.join(homeDir, GLOBAL_STORAGE_DIRECTORY, "application.json"),
				StorageScope.APPLICATION,
			),
		);
		this.storages.set(
			StorageScope.PROFILE,
			this.createFixedStorage(
				path.join(
					homeDir,
					GLOBAL_STORAGE_DIRECTORY,
					PROFILE_STORAGE_DIRECTORY,
					encodeStorageId(options.profileId),
					STORAGE_FILENAME,
				),
				StorageScope.PROFILE,
			),
		);
		this.storages.set(
			StorageScope.WORKSPACE,
			this.createWorkspaceStorage(options.workspace),
		);
	}

	public get workspace(): IAnyWorkspaceIdentifier {
		return this.currentWorkspace;
	}

	public getStorage(scope: StorageScope): IStorageMain {
		const storage = this.storages.get(scope);
		if (!storage) {
			throw new Error(`Storage is not configured for scope ${scope}.`);
		}

		return storage;
	}

	protected override async doInitialize(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).init()));
		for (const scope of ALL_STORAGE_SCOPES) {
			this.initializeTargets(scope);
		}
	}

	public override async switchWorkspace(
		workspace: IAnyWorkspaceIdentifier,
	): Promise<void> {
		if (isSameWorkspace(this.currentWorkspace, workspace)) {
			return;
		}

		const oldStorage = this.getStorage(StorageScope.WORKSPACE);
		const oldItems = new Map(oldStorage.items);
		await oldStorage.close();
		this.workspaceDisposables.clear();

		const newStorage = this.createWorkspaceStorage(workspace);
		this.storages.set(StorageScope.WORKSPACE, newStorage);
		this.currentWorkspace = workspace;
		await newStorage.init();
		this.switchData(StorageScope.WORKSPACE, oldItems, newStorage.items);
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.getStorage(scope).get(key);
	}

	protected writeValue(
		key: string,
		scope: StorageScope,
		value: string,
	): Promise<void> {
		return this.getStorage(scope).set(key, value);
	}

	protected deleteValue(key: string, scope: StorageScope): Promise<void> {
		return this.getStorage(scope).delete(key);
	}

	protected readKeys(scope: StorageScope): string[] {
		return Array.from(this.getStorage(scope).items.keys());
	}

	protected override async doFlush(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).flush(0)));
	}

	protected override async doClose(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).close()));
	}

	public override dispose(): void {
		this.storages.clear();
		this.workspaceDisposables.dispose();
		this.fixedDisposables.dispose();
		super.dispose();
	}

	private createFixedStorage(
		storagePath: string,
		scope: StorageScope.APPLICATION | StorageScope.PROFILE,
	): IStorageMain {
		const storage = this.fixedDisposables.add(new StorageMain({
			path: storagePath,
			type: "json",
			logWarning: this.options.logWarning,
		}));
		this.registerStorageListener(storage, scope, this.fixedDisposables);
		return storage;
	}

	private createWorkspaceStorage(workspace: IAnyWorkspaceIdentifier): IStorageMain {
		const storagePath =
			isSingleFolderWorkspaceIdentifier(workspace) &&
			workspace.uri.scheme === "file"
				? path.join(
					workspace.uri.fsPath,
					WORKSPACE_STORAGE_FOLDER_NAME,
					WORKSPACE_STORAGE_FILENAME,
				)
				: undefined;
		if (storagePath) {
			ensureWorkspaceStorageDirectory(path.dirname(storagePath));
		}
		const storage = this.workspaceDisposables.add(new StorageMain(
			storagePath
				? {
					path: storagePath,
					type: "sqlite",
					logWarning: this.options.logWarning,
				}
				: { type: "memory" },
		));
		this.registerStorageListener(
			storage,
			StorageScope.WORKSPACE,
			this.workspaceDisposables,
		);
		return storage;
	}

	private registerStorageListener(
		storage: IStorageMain,
		scope: StorageScope,
		store: DisposableStore,
	): void {
		store.add(storage.onDidChangeStorage(event => {
			if (event.external) {
				this.fireDidChangeValueExternal(event.key, scope);
			}
		}));
	}
}

export function createStorageMainService(
	options: StorageMainServiceOptions,
): StorageMainService {
	return new StorageMainService(options);
}

function encodeStorageId(id: string): string {
	const normalized = id.trim();
	if (!normalized) {
		throw new Error("Storage identity must not be empty.");
	}

	return encodeURIComponent(normalized);
}

function isSameWorkspace(
	first: IAnyWorkspaceIdentifier,
	second: IAnyWorkspaceIdentifier,
): boolean {
	if (first.id !== second.id) {
		return false;
	}

	if (
		isSingleFolderWorkspaceIdentifier(first) &&
		isSingleFolderWorkspaceIdentifier(second)
	) {
		return URI.revive(first.uri).toString() === URI.revive(second.uri).toString();
	}

	return !isSingleFolderWorkspaceIdentifier(first) &&
		!isSingleFolderWorkspaceIdentifier(second);
}

function ensureWorkspaceStorageDirectory(directory: string): void {
	fs.mkdirSync(directory, { recursive: true });
	const ignorePath = path.join(directory, ".gitignore");
	try {
		fs.writeFileSync(
			ignorePath,
			"# Conductor workspace state\n*\n",
			{ encoding: "utf8", flag: "wx" },
		);
	} catch (error) {
		if (
			!error ||
			typeof error !== "object" ||
			(error as { readonly code?: unknown }).code !== "EEXIST"
		) {
			throw error;
		}
	}
}
