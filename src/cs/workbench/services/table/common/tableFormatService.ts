/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import { getTableFormatIdByResource } from "src/cs/workbench/services/table/common/tableFormatAssociations";
import {
	TABLE_IMPORT_FILE_EXTENSIONS,
	canMaterializeTableFormat,
	type TableFormatId,
	type TableImportFileExtension,
} from "src/cs/workbench/services/table/common/tableFormatRegistry";

export type { TableFormatId, TableImportFileExtension };

export class TableFormatService {
	public canHandle(resource: URI | string | null | undefined): boolean {
		return canMaterializeTableFormat(this.resolveFormat(resource));
	}

	public resolveFormat(resource: URI | string | null | undefined): TableFormatId | null {
		return getTableFormatIdByResource(resource);
	}

	public getSupportedExtensions(): readonly TableImportFileExtension[] {
		return TABLE_IMPORT_FILE_EXTENSIONS;
	}

	public isDelimitedText(resource: URI | string | null | undefined): boolean {
		const format = this.resolveFormat(resource);
		return format === "csv" || format === "tsv";
	}

	public isWorkbook(resource: URI | string | null | undefined): boolean {
		const format = this.resolveFormat(resource);
		return format === "xls" || format === "xlsx";
	}

	public isMaterializableWorkbook(resource: URI | string | null | undefined): boolean {
		const format = this.resolveFormat(resource);
		return format === "xls" || format === "xlsx";
	}

	public isTsv(resource: URI | string | null | undefined): boolean {
		return this.resolveFormat(resource) === "tsv";
	}

	public isXlsx(resource: URI | string | null | undefined): boolean {
		return this.resolveFormat(resource) === "xlsx";
	}
}

export const tableFormatService = new TableFormatService();
