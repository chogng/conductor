/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type {
	IFileService,
	IReadFileEncoding,
} from "src/cs/platform/files/common/files";
import type {
	ITableModel,
	TableModelPreviewInput,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import { tableFileFormatService } from "src/cs/workbench/services/tablefile/common/tableFileFormat";
import {
	getTableFileReadEncoding,
} from "src/cs/workbench/services/tablefile/common/encoding";
import {
	TableFileEditorModel,
} from "src/cs/workbench/services/tablefile/common/tableFileEditorModel";
import {
	TableFileEditorModelManager,
	type TableFileEditorModelManagerResolveOptions,
} from "src/cs/workbench/services/tablefile/common/tableFileEditorModelManager";

export class TableFileService extends Disposable {
	private readonly tableFileEditorModelManager: TableFileEditorModelManager;
	public readonly onDidChangeModel: Event<ITableModel>;

	public constructor(
		fileService: IFileService,
	) {
		super();

		this.tableFileEditorModelManager = this._register(new TableFileEditorModelManager(
			fileService,
		));
		this.onDidChangeModel = this.tableFileEditorModelManager.onDidChangeModel;
	}

	public canHandleResource(resource: URI): boolean {
		return tableFileFormatService.canHandle(resource);
	}

	public getReadEncoding(resource: URI): IReadFileEncoding {
		return getTableFileReadEncoding(resource);
	}

	public get(resource: URI | null | undefined): ITableModel | undefined {
		return this.tableFileEditorModelManager.get(resource);
	}

	public getPreviewInput(source: TableSource | null | undefined): TableModelPreviewInput | null {
		return this.tableFileEditorModelManager.getPreviewInput(source);
	}

	public getOrCreateFileEditorModel(
		resource: URI,
		source?: TableSource | null,
	): TableFileEditorModel {
		if (!this.canHandleResource(resource)) {
			throw new Error(`Unsupported table file: ${resource.toString()}`);
		}

		return this.tableFileEditorModelManager.getOrCreateFileEditorModel(resource, source);
	}

	public async resolveModel(
		model: TableFileEditorModel,
		options: TableFileEditorModelManagerResolveOptions = {},
	): Promise<void> {
		await this.tableFileEditorModelManager.resolveModel(model, {
			...options,
			readEncoding: options.readEncoding ?? this.getReadEncoding(model.resource),
		});
	}

	public resolve(resource: URI, source?: TableSource | null): void {
		void this.resolveModel(this.getOrCreateFileEditorModel(resource, source));
	}

	public remove(resource: URI): void {
		this.tableFileEditorModelManager.remove(resource);
	}
}
