/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type {
	IFileService,
	IFileStat,
} from "src/cs/platform/files/common/files";
import type {
	ITableModel,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import { tableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import type { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";
import {
	getTableFileReadMode,
	type TableFileReadMode,
} from "src/cs/workbench/services/tableFile/common/encoding";
import {
	TableFileEditorModel,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModel";
import {
	TableFileEditorModelManager,
	type TableFileEditorModelManagerResolveOptions,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModelManager";
import type {
	ITableFileService,
	TableFileResolvedContent,
} from "src/cs/workbench/services/tableFile/common/tablefiles";

export class TableFileService extends Disposable implements ITableFileService {
	public declare readonly _serviceBrand: undefined;

	private readonly tableFileEditorModelManager: TableFileEditorModelManager;
	public readonly onDidChangeContent: Event<URI>;
	public readonly onDidChangeModel: Event<ITableModel>;

	public constructor(
		private readonly fileService: IFileService,
		tableStructureParserService: ITableStructureParserService,
	) {
		super();

		this.tableFileEditorModelManager = this._register(new TableFileEditorModelManager(
			tableStructureParserService,
			fileService,
		));
		this.onDidChangeContent = this.tableFileEditorModelManager.onDidChangeContent;
		this.onDidChangeModel = this.tableFileEditorModelManager.onDidChangeModel;
	}

	public canHandleResource(resource: URI): boolean {
		return tableFormatService.canHandle(resource);
	}

	public getReadMode(resource: URI): TableFileReadMode {
		const format = tableFormatService.resolveFormat(resource);
		if (!format || !tableFormatService.canHandle(resource)) {
			throw new Error(`Unsupported table file: ${resource.toString()}`);
		}
		return getTableFileReadMode(format);
	}

	public get(resource: URI | null | undefined): ITableModel | undefined {
		return this.tableFileEditorModelManager.get(resource);
	}

	public getResolvedContent(
		resource: URI | null | undefined,
	): TableFileResolvedContent | undefined {
		return this.tableFileEditorModelManager.getResolvedContent(resource);
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
		await this.tableFileEditorModelManager.resolveModel(
			model,
			this.normalizeResolveOptions(model, options),
		);
	}

	public async resolveContent(
		model: TableFileEditorModel,
		options: TableFileEditorModelManagerResolveOptions = {},
	): Promise<TableFileResolvedContent> {
		return this.tableFileEditorModelManager.resolveContent(
			model,
			this.normalizeResolveOptions(model, options),
		);
	}

	public resolve(resource: URI, source?: TableSource | null): void {
		void this.resolveModel(this.getOrCreateFileEditorModel(resource, source))
			.catch(() => undefined);
	}

	public remove(resource: URI): void {
		this.tableFileEditorModelManager.remove(resource);
	}

	public stat(resource: URI): Promise<IFileStat> {
		return this.fileService.stat(resource);
	}

	protected normalizeResolveOptions(
		model: TableFileEditorModel,
		options: TableFileEditorModelManagerResolveOptions,
	): TableFileEditorModelManagerResolveOptions {
		return {
			...options,
			readMode: options.readMode ?? this.getReadMode(model.resource),
		};
	}
}
