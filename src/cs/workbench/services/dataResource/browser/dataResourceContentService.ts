/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
	type DataResourceContentProviderResult,
	type DataResourceContentSnapshot,
	IDataResourceContentService,
	type IDataResourceContentProvider,
	type IDataResourceContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResourceContentService";
import {
	ITableFileService,
	type ITableFileService as ITableFileServiceType,
	type TableFileResolvedContent,
} from "src/cs/workbench/services/tableFile/common/tablefiles";

export class DataResourceContentService extends Disposable implements IDataResourceContentService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeContentEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeContent: Event<URI> = this.onDidChangeContentEmitter.event;

	private readonly contentProviders: IDataResourceContentProvider[] = [];
	private readonly pendingProviderResolves = new Map<string, Promise<DataResourceContentSnapshot>>();
	private readonly providerSnapshots = new Map<string, DataResourceContentSnapshot>();
	private readonly referenceCounts = new Map<string, { count: number; resource: URI }>();

	public constructor(
		@ITableFileService private readonly tableFileService: ITableFileServiceType,
	) {
		super();
		this._register(this.tableFileService.onDidChangeContent(resource => {
			this.onDidChangeContentEmitter.fire(resource);
		}));
	}

	public canHandleResource(resource: URI): boolean {
		return this.tableFileService.canHandleResource(resource) || Boolean(this.findContentProvider(resource));
	}

	public async createContentReference(resource: URI): Promise<IDataResourceContentReference> {
		if (!this.canHandleResource(resource)) {
			throw new Error(`Unsupported data resource: ${resource.toString()}`);
		}

		const key = resource.toString();
		this.retainReference(key, resource);
		try {
			const object = this.tableFileService.canHandleResource(resource)
				? await this.resolveFileContent(resource)
				: await this.resolveProviderContent(resource);
			let disposed = false;
			return {
				object,
				dispose: () => {
					if (disposed) {
						return;
					}
					disposed = true;
					this.releaseReference(key);
				},
			};
		} catch (error) {
			this.releaseReference(key);
			throw error;
		}
	}

	public get(resource: URI | null | undefined): DataResourceContentSnapshot | undefined {
		const key = resource?.toString();
		if (!key || !resource) {
			return undefined;
		}
		const fileContent = this.tableFileService.getResolvedContent(resource);
		return fileContent
			? toDataResourceContentSnapshot(fileContent, resource)
			: this.providerSnapshots.get(key);
	}

	public registerContentProvider(provider: IDataResourceContentProvider): IDisposable {
		this.contentProviders.push(provider);
		return {
			dispose: () => {
				const index = this.contentProviders.indexOf(provider);
				if (index >= 0) {
					this.contentProviders.splice(index, 1);
				}
				provider.dispose();
			},
		};
	}

	private async resolveFileContent(resource: URI): Promise<DataResourceContentSnapshot> {
		const model = this.tableFileService.getOrCreateFileEditorModel(resource);
		const resolved = await this.tableFileService.resolveContent(model);
		return toDataResourceContentSnapshot(resolved, resource);
	}

	private async resolveProviderContent(resource: URI): Promise<DataResourceContentSnapshot> {
		const key = resource.toString();
		const cached = this.providerSnapshots.get(key);
		if (cached) {
			return cached;
		}
		const pending = this.pendingProviderResolves.get(key);
		if (pending) {
			return pending;
		}
		const provider = this.findContentProvider(resource);
		if (!provider) {
			throw new Error(`No data resource content provider owns ${resource.toString()}.`);
		}
		const pendingResolve = provider.resolveContent(resource)
			.then(result => this.storeProviderSnapshot(resource, result))
			.finally(() => {
				if (this.pendingProviderResolves.get(key) === pendingResolve) {
					this.pendingProviderResolves.delete(key);
				}
			});
		this.pendingProviderResolves.set(key, pendingResolve);
		return pendingResolve;
	}

	private storeProviderSnapshot(
		resource: URI,
		result: DataResourceContentProviderResult,
	): DataResourceContentSnapshot {
		const key = resource.toString();
		const snapshot: DataResourceContentSnapshot = {
			content: result.content,
			defaultSheetId: result.defaultSheetId ?? result.sheets?.[0]?.sheetId ?? null,
			diagnostics: result.diagnostics ?? [],
			format: result.format,
			resource,
			sheets: result.sheets ?? [],
			sourceVersion: normalizeVersion(result.sourceVersion),
			version: (this.providerSnapshots.get(key)?.version ?? 0) + 1,
		};
		this.providerSnapshots.set(key, snapshot);
		return snapshot;
	}

	private findContentProvider(resource: URI): IDataResourceContentProvider | null {
		return this.contentProviders.find(provider => provider.canHandleResource(resource)) ?? null;
	}

	private retainReference(key: string, resource: URI): void {
		const reference = this.referenceCounts.get(key);
		this.referenceCounts.set(key, {
			count: (reference?.count ?? 0) + 1,
			resource,
		});
	}

	private releaseReference(key: string): void {
		const reference = this.referenceCounts.get(key);
		const count = (reference?.count ?? 0) - 1;
		if (reference && count > 0) {
			this.referenceCounts.set(key, {
				count,
				resource: reference.resource,
			});
			return;
		}

		this.referenceCounts.delete(key);
		this.providerSnapshots.delete(key);
		this.pendingProviderResolves.delete(key);
		if (reference && this.tableFileService.canHandleResource(reference.resource)) {
			this.tableFileService.remove(reference.resource);
		}
	}
}

const toDataResourceContentSnapshot = (
	resolved: TableFileResolvedContent,
	resource: URI,
): DataResourceContentSnapshot => {
	const content = resolved.content;
	return {
		content: content.content,
		defaultSheetId: content.defaultSheetId ?? content.sheets?.[0]?.sheetId ?? null,
		diagnostics: content.diagnostics ?? [],
		format: content.format,
		resource,
		sheets: content.sheets ?? [],
		sourceVersion: normalizeVersion(content.sourceVersion),
		version: resolved.version,
	};
};

const normalizeVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));
