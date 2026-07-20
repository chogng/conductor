/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
	DataResourceContentMemoryEstimator,
	DataResourceContentMemoryGate,
} from "src/cs/workbench/services/dataResource/browser/dataResourceContentMemoryGate";
import {
	type DataResourceContentKind,
	type DataResourceContentProviderResult,
	type DataResourceContentSnapshot,
	IDataResourceContentService,
	type IDataResourceContentProvider,
	type IDataResourceContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResourceContentService";
import { tableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import {
	ITableFileService,
	type ITableFileService as ITableFileServiceType,
	type TableFileResolvedContent,
} from "src/cs/workbench/services/tableFile/common/tablefiles";

const Mebibyte = 1024 * 1024;
// Keep adjacent Review, Slice, and Table consumers on one physical snapshot
// without extending the public model-reference lifetime or retaining files unboundedly.
const RetainedFileContentByteLimit = 128 * Mebibyte;
const RetainedFileContentEntryLimit = 16;

type FileSnapshotCacheEntry = {
	readonly estimatedBytes: number;
	readonly resolved: TableFileResolvedContent;
	readonly snapshot: DataResourceContentSnapshot;
};

type RetainedFileContentEntry = {
	readonly estimatedBytes: number;
	readonly resource: URI;
};

export class DataResourceContentService extends Disposable implements IDataResourceContentService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeContentEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeContent: Event<URI> = this.onDidChangeContentEmitter.event;

	private readonly contentProviders: IDataResourceContentProvider[] = [];
	private readonly contentVersions = new Map<string, number>();
	private readonly fileErrorSnapshots = new Map<string, DataResourceContentSnapshot>();
	private readonly fileSnapshots = new Map<string, FileSnapshotCacheEntry>();
	private readonly pendingFileResolves = new Map<string, Promise<DataResourceContentSnapshot>>();
	private readonly pendingProviderResolves = new Map<string, Promise<DataResourceContentSnapshot>>();
	private readonly providerSnapshots = new Map<string, DataResourceContentSnapshot>();
	private readonly referenceCounts = new Map<string, {
		count: number;
		readonly kind: DataResourceContentKind;
		readonly resource: URI;
	}>();
	private readonly retainedFileContents = new Map<string, RetainedFileContentEntry>();
	private retainedFileContentBytes = 0;
	private readonly memoryEstimator = new DataResourceContentMemoryEstimator();
	private readonly memoryGate: DataResourceContentMemoryGate;

	public constructor(
		@ITableFileService private readonly tableFileService: ITableFileServiceType,
		memoryGate?: DataResourceContentMemoryGate,
	) {
		super();
		this.memoryGate = this._register(memoryGate ?? new DataResourceContentMemoryGate());
		this._register(this.tableFileService.onDidChangeContent(resource => {
			const key = resource.toString();
			this.fileErrorSnapshots.delete(key);
			this.fileSnapshots.delete(key);
			this.onDidChangeContentEmitter.fire(resource);
		}));
	}

	public canHandleResource(resource: URI): boolean {
		return this.getContentKind(resource) !== null;
	}

	public async createContentReference(resource: URI): Promise<IDataResourceContentReference> {
		const kind = this.getContentKind(resource);
		if (!kind) {
			throw new Error(`Unsupported data resource: ${resource.toString()}`);
		}

		const key = resource.toString();
		this.retainReference(key, resource, kind);
		try {
			const object = kind === "provider"
				? await this.resolveProviderContent(resource, this.findContentProvider(resource)!)
				: await this.resolveFileContent(resource);
			let disposed = false;
			return {
				kind,
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
		const providerSnapshot = this.providerSnapshots.get(key);
		if (providerSnapshot) {
			return providerSnapshot;
		}
		if (!this.referenceCounts.has(key)) {
			return undefined;
		}
		const fileContent = this.tableFileService.getResolvedContent(resource);
		if (fileContent) {
			return this.getOrCreateFileSnapshot(resource, fileContent).snapshot;
		}
		return this.fileSnapshots.get(key)?.snapshot ?? this.fileErrorSnapshots.get(key);
	}

	public getContentKind(resource: URI): DataResourceContentKind | null {
		if (this.findContentProvider(resource)) {
			return "provider";
		}
		return this.tableFileService.canHandleResource(resource) ? "file" : null;
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
		const key = resource.toString();
		const cached = this.tableFileService.getResolvedContent(resource);
		if (cached) {
			const stat = await this.tableFileService.stat(resource);
			return this.getOrCreateFileSnapshot(
				resource,
				cached,
				this.memoryEstimator.estimate(stat.size, tableFormatService.resolveFormat(resource)),
			).snapshot;
		}
		const pending = this.pendingFileResolves.get(key);
		if (pending) {
			return pending;
		}

		const pendingResolve = this.resolveUncachedFileContent(resource)
			.finally(() => {
				if (this.pendingFileResolves.get(key) === pendingResolve) {
					this.pendingFileResolves.delete(key);
				}
			});
		this.pendingFileResolves.set(key, pendingResolve);
		return pendingResolve;
	}

	private async resolveUncachedFileContent(
		resource: URI,
	): Promise<DataResourceContentSnapshot> {
		const model = this.tableFileService.getOrCreateFileEditorModel(resource);
		let lease: IDisposable | null = null;
		try {
			let stat = await this.tableFileService.stat(resource);
			const format = tableFormatService.resolveFormat(resource);
			let estimatedBytes = this.memoryEstimator.estimate(stat.size, format);
			lease = await this.memoryGate.acquire(estimatedBytes);

			// Recheck after waiting. If the file grew materially while queued,
			// reacquire using the new estimate before starting the heavy read.
			stat = await this.tableFileService.stat(resource);
			const currentEstimate = this.memoryEstimator.estimate(stat.size, format);
			if (currentEstimate > estimatedBytes) {
				lease.dispose();
				lease = null;
				estimatedBytes = currentEstimate;
				lease = await this.memoryGate.acquire(estimatedBytes);
			}

			const canCalibrate =
				this.memoryEstimator.canObserve(stat.size) &&
				this.memoryGate.getSnapshot().activeLeaseCount === 1;
			const memoryBefore = canCalibrate
				? await this.memoryGate.sampleMemory()
				: null;
			const resolved = await this.tableFileService.resolveContent(model);
			if (
				memoryBefore &&
				this.memoryGate.getSnapshot().activeLeaseCount === 1
			) {
				this.memoryEstimator.observe(
					format,
					stat.size,
					memoryBefore,
					await this.memoryGate.sampleMemory(),
				);
			}
			this.fileErrorSnapshots.delete(resource.toString());
			return this.getOrCreateFileSnapshot(resource, resolved, estimatedBytes).snapshot;
		} catch (error) {
			return this.storeFileErrorSnapshot(resource, error);
		} finally {
			lease?.dispose();
		}
	}

	private async resolveProviderContent(
		resource: URI,
		provider: IDataResourceContentProvider,
	): Promise<DataResourceContentSnapshot> {
		const key = resource.toString();
		const cached = this.providerSnapshots.get(key);
		if (cached) {
			return cached;
		}
		const pending = this.pendingProviderResolves.get(key);
		if (pending) {
			return pending;
		}
		const pendingResolve = provider.resolveContent(resource)
			.then(result => this.storeProviderSnapshot(resource, result))
			.catch(error => this.storeProviderErrorSnapshot(resource, error))
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
			errorMessage: null,
			format: result.format,
			resource,
			sheets: result.sheets ?? [],
			sourceVersion: normalizeVersion(result.sourceVersion),
			version: this.nextContentVersion(key),
		};
		this.providerSnapshots.set(key, snapshot);
		return snapshot;
	}

	private findContentProvider(resource: URI): IDataResourceContentProvider | null {
		return this.contentProviders.find(provider => provider.canHandleResource(resource)) ?? null;
	}

	private retainReference(
		key: string,
		resource: URI,
		kind: DataResourceContentKind,
	): void {
		const reference = this.referenceCounts.get(key);
		if (!reference && kind === "file") {
			this.forgetRetainedFileContent(key);
		}
		this.referenceCounts.set(key, {
			count: (reference?.count ?? 0) + 1,
			kind,
			resource,
		});
	}

	private releaseReference(key: string): void {
		const reference = this.referenceCounts.get(key);
		const count = (reference?.count ?? 0) - 1;
		if (reference && count > 0) {
			this.referenceCounts.set(key, {
				count,
				kind: reference.kind,
				resource: reference.resource,
			});
			return;
		}

		this.referenceCounts.delete(key);
		if (reference?.kind === "file") {
			this.fileErrorSnapshots.delete(key);
			this.pendingFileResolves.delete(key);
			if ((this.fileSnapshots.get(key)?.estimatedBytes ?? 0) > 0) {
				this.retainFileContent(key, reference.resource);
				return;
			}
			this.tableFileService.remove(reference.resource);
		}
		this.contentVersions.delete(key);
		this.fileErrorSnapshots.delete(key);
		this.fileSnapshots.delete(key);
		this.pendingFileResolves.delete(key);
		this.providerSnapshots.delete(key);
		this.pendingProviderResolves.delete(key);
	}

	private getOrCreateFileSnapshot(
		resource: URI,
		resolved: TableFileResolvedContent,
		estimatedBytes = 0,
	): FileSnapshotCacheEntry {
		const key = resource.toString();
		const cached = this.fileSnapshots.get(key);
		if (cached?.resolved === resolved) {
			if (estimatedBytes <= 0 || cached.estimatedBytes === estimatedBytes) {
				return cached;
			}
			const updated = { ...cached, estimatedBytes };
			this.fileSnapshots.set(key, updated);
			return updated;
		}
		const snapshot = toDataResourceContentSnapshot(
			resolved,
			resource,
			this.nextContentVersion(key),
		);
		const entry = { estimatedBytes, resolved, snapshot };
		this.fileSnapshots.set(key, entry);
		return entry;
	}

	private retainFileContent(key: string, resource: URI): void {
		const cached = this.fileSnapshots.get(key);
		if (!cached) {
			return;
		}
		this.forgetRetainedFileContent(key);
		this.retainedFileContents.set(key, {
			estimatedBytes: cached.estimatedBytes,
			resource,
		});
		this.retainedFileContentBytes += cached.estimatedBytes;
		this.trimRetainedFileContent();
	}

	private forgetRetainedFileContent(key: string): void {
		const retained = this.retainedFileContents.get(key);
		if (!retained) {
			return;
		}
		this.retainedFileContents.delete(key);
		this.retainedFileContentBytes = Math.max(
			0,
			this.retainedFileContentBytes - retained.estimatedBytes,
		);
	}

	private trimRetainedFileContent(): void {
		while (
			this.retainedFileContents.size > RetainedFileContentEntryLimit ||
			this.retainedFileContentBytes > RetainedFileContentByteLimit
		) {
			const oldest = this.retainedFileContents.entries().next().value as
				| [string, RetainedFileContentEntry]
				| undefined;
			if (!oldest) {
				return;
			}
			const [key, retained] = oldest;
			this.forgetRetainedFileContent(key);
			this.contentVersions.delete(key);
			this.fileErrorSnapshots.delete(key);
			this.fileSnapshots.delete(key);
			this.pendingFileResolves.delete(key);
			this.tableFileService.remove(retained.resource);
		}
	}

	private storeFileErrorSnapshot(
		resource: URI,
		error: unknown,
	): DataResourceContentSnapshot {
		const key = resource.toString();
		const snapshot = createErrorContentSnapshot(
			resource,
			error,
			this.nextContentVersion(key),
		);
		this.fileSnapshots.delete(key);
		this.fileErrorSnapshots.set(key, snapshot);
		return snapshot;
	}

	private storeProviderErrorSnapshot(
		resource: URI,
		error: unknown,
	): DataResourceContentSnapshot {
		const key = resource.toString();
		const snapshot = createErrorContentSnapshot(
			resource,
			error,
			this.nextContentVersion(key),
		);
		this.providerSnapshots.set(key, snapshot);
		return snapshot;
	}

	private nextContentVersion(key: string): number {
		const version = (this.contentVersions.get(key) ?? 0) + 1;
		this.contentVersions.set(key, version);
		return version;
	}
}

const toDataResourceContentSnapshot = (
	resolved: TableFileResolvedContent,
	resource: URI,
	version: number,
): DataResourceContentSnapshot => {
	const content = resolved.content;
	return {
		content: content.content,
		defaultSheetId: content.defaultSheetId ?? content.sheets?.[0]?.sheetId ?? null,
		diagnostics: content.diagnostics ?? [],
		errorMessage: null,
		format: content.format,
		resource,
		sheets: content.sheets ?? [],
		sourceVersion: normalizeVersion(content.sourceVersion),
		version,
	};
};

const createErrorContentSnapshot = (
	resource: URI,
	error: unknown,
	version: number,
): DataResourceContentSnapshot => ({
	content: null,
	defaultSheetId: null,
	diagnostics: [],
	errorMessage: getErrorMessage(error),
	format: null,
	resource,
	sheets: [],
	sourceVersion: 0,
	version,
});

const normalizeVersion = (value: unknown): number =>
	Math.max(0, Math.floor(Number(value) || 0));

const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The data resource content could not be resolved.";
