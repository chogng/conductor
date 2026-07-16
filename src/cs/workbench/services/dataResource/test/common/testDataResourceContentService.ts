/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import {
	type DataResourceContentSnapshot,
	type IDataResourceContentProvider,
	type IDataResourceContentReference,
	type IDataResourceContentService,
} from "src/cs/workbench/services/dataResource/common/dataResourceContentService";
import type {
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";

export class TestDataResourceContentService extends Disposable implements IDataResourceContentService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeContentEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeContent = this.onDidChangeContentEmitter.event;
	private resolvingReferenceCount = 0;
	private readonly snapshots = new Map<string, DataResourceContentSnapshot>();

	public constructor(
		private readonly tableModelService: ITableModelService,
		private readonly suppressResolveEvents = true,
	) {
		super();
		this._register(this.tableModelService.onDidChangeModel(model => {
			const key = model.resource.toString();
			const snapshot = this.tableModelService.get(model.resource)?.getSnapshot();
			if (snapshot) {
				this.snapshots.set(key, toDataResourceContentSnapshot(snapshot));
			} else {
				this.snapshots.delete(key);
			}
			if (!this.suppressResolveEvents || !this.resolvingReferenceCount) {
				this.onDidChangeContentEmitter.fire(model.resource);
			}
		}));
	}

	public canHandleResource(resource: URI): boolean {
		return this.tableModelService.canHandleResource(resource);
	}

	public async createContentReference(resource: URI): Promise<IDataResourceContentReference> {
		this.resolvingReferenceCount += 1;
		let reference: ITableModelReference;
		try {
			reference = await this.tableModelService.createModelReference(resource);
		} finally {
			this.resolvingReferenceCount -= 1;
		}
		const snapshot = reference.object.getSnapshot();
		const contentSnapshot = toDataResourceContentSnapshot(snapshot);
		this.snapshots.set(resource.toString(), contentSnapshot);
		return {
			kind: "provider",
			object: contentSnapshot,
			dispose: () => {
				reference.dispose();
			},
		};
	}

	public get(resource: URI | null | undefined): DataResourceContentSnapshot | undefined {
		const key = resource?.toString();
		if (!key) {
			return undefined;
		}
		const snapshot = this.tableModelService.get(resource)?.getSnapshot();
		if (snapshot) {
			const contentSnapshot = toDataResourceContentSnapshot(snapshot);
			this.snapshots.set(key, contentSnapshot);
			return contentSnapshot;
		}
		return this.snapshots.get(key);
	}

	public getContentKind(resource: URI): "provider" | null {
		return this.tableModelService.canHandleResource(resource) ? "provider" : null;
	}

	public registerContentProvider(provider: IDataResourceContentProvider): { dispose(): void } {
		return {
			dispose: () => {
				provider.dispose();
			},
		};
	}
}

const toDataResourceContentSnapshot = (
	snapshot: ReturnType<NonNullable<ReturnType<ITableModelService["get"]>>["getSnapshot"]>,
): DataResourceContentSnapshot => ({
	content: snapshot.content,
	defaultSheetId: snapshot.defaultSheetId,
	diagnostics: snapshot.diagnostics,
	errorMessage: snapshot.loadState.state === "error" ? snapshot.loadState.message : null,
	format: snapshot.format,
	resource: snapshot.resource,
	sheets: snapshot.sheets,
	sourceVersion: snapshot.sourceVersion,
	version: snapshot.version,
});
