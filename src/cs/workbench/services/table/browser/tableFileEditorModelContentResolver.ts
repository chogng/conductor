/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import {
	type IFileContent,
	type IFileService,
	type IFileStat,
} from "src/cs/platform/files/common/files";
import {
	type FileConverterPreparedFile,
	type FileConverterPreparedSheet,
	type IFileConverterBackendService as IFileConverterBackendServiceType,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import { toTableSourceKey } from "src/cs/workbench/services/table/common/table";
import {
	type TableModelContentSnapshot,
	type TableModelPreviewInput,
	type TableModelSheetSnapshot,
} from "src/cs/workbench/services/table/common/tableModel";
import {
	type ITableFileEditorModelContentResolver,
	type TableModelResolvedContent,
	createEmptyTableModelContentSnapshot,
	createTableModelContentSnapshot,
	getResourceFileName,
	getResourcePath,
	normalizeResourceSourceVersion,
} from "src/cs/workbench/services/table/common/tableFileEditorModel";
import { tableFileFormatService } from "src/cs/workbench/services/table/common/tableFileFormat";

type ResolvedExcelSheet = {
	readonly content: TableModelContentSnapshot;
	readonly sheetId: string;
	readonly sheetName: string | null;
	readonly sourceKey: string;
};

export class TableFileEditorModelContentResolver implements ITableFileEditorModelContentResolver {
	public constructor(
		private readonly fileService: IFileService,
		private readonly fileConverterBackendService: IFileConverterBackendServiceType,
	) { }

	public createErrorPreviewInput(resource: URI, message: string): TableModelPreviewInput {
		return createFailedResourcePreviewInput({ message, resource });
	}

	public async resolve(
		resource: URI,
		sourceKey: string,
		stat: IFileStat,
	): Promise<TableModelResolvedContent> {
		const fileName = getResourceFileName(resource);
		const resourceFile = await readResourceAsBrowserFile({
			fileName,
			fileService: this.fileService,
			resource,
			stat,
		});

		if (tableFileFormatService.isExcel(resource)) {
			const excelContent = await this.resolveExcelContent({
				file: resourceFile.file,
				fileName,
				resource,
				sourceKey,
				stat,
			});
			if (excelContent) {
				return excelContent;
			}
		}

		const content = createTableModelContentSnapshot(
			resourceFile.text,
			tableFileFormatService.getFormat(resource),
		);
		const previewInput = createResourcePreviewInput({
			content,
			file: resourceFile.file,
			fileName,
			resource,
			stat,
		});
		return {
			content,
			previewInput,
			previewInputsBySourceKey: [[sourceKey, previewInput]],
			sheets: content ? [{
				content,
				sheetId: sourceKey,
				sheetName: null,
				sourceKey,
			}] : [],
		};
	}

	private async resolveExcelContent({
		file,
		fileName,
		resource,
		sourceKey,
		stat,
	}: {
		readonly file: File;
		readonly fileName: string;
		readonly resource: URI;
		readonly sourceKey: string;
		readonly stat: IFileStat;
	}): Promise<TableModelResolvedContent | null> {
		const sourcePath = getResourcePath(resource);
		if (!sourcePath || !this.fileConverterBackendService.canPrepareFile()) {
			return null;
		}

		const prepared = await this.fileConverterBackendService.prepareFile({
			fileName,
			path: sourcePath,
			sourceMtimeMs: normalizeResourceSourceVersion(stat.mtime),
			sourceSizeBytes: normalizeResourceSourceVersion(stat.size),
		});
		const sheets = await this.createExcelSheetSnapshots({
			prepared,
			resource,
			sourceKey,
		});
		if (!sheets.length) {
			return null;
		}

		const previewInputsBySourceKey: [string, TableModelPreviewInput][] = [];
		const modelSheets: TableModelSheetSnapshot[] = sheets.map(sheet => ({
			content: sheet.content,
			sheetId: sheet.sheetId,
			sheetName: sheet.sheetName,
			sourceKey: sheet.sourceKey,
		}));

		let primaryPreviewInput: TableModelPreviewInput | null = null;
		for (const sheet of sheets) {
			const previewInput = createResourcePreviewInput({
				content: sheet.content,
				file,
				fileName,
				resource,
				sheetId: sheet.sheetId,
				sheetName: sheet.sheetName,
				stat,
			});
			previewInputsBySourceKey.push([sheet.sourceKey, previewInput]);
			primaryPreviewInput ??= previewInput;
		}

		return {
			content: sheets[0]?.content ?? null,
			previewInput: primaryPreviewInput ?? createResourcePreviewInput({
				content: null,
				file,
				fileName,
				resource,
				stat,
			}),
			previewInputsBySourceKey,
			sheets: modelSheets,
		};
	}

	private async createExcelSheetSnapshots({
		prepared,
		resource,
		sourceKey,
	}: {
		readonly prepared: FileConverterPreparedFile;
		readonly resource: URI;
		readonly sourceKey: string;
	}): Promise<readonly ResolvedExcelSheet[]> {
		const preparedSheets = getPreparedSheets(prepared);
		if (preparedSheets.length) {
			const sheets: ResolvedExcelSheet[] = [];
			for (let index = 0; index < preparedSheets.length; index += 1) {
				const sheet = preparedSheets[index]!;
				const csvText = await this.readPreparedSheetCsvText(sheet);
				const content = createTableModelContentSnapshot(csvText, "csv") ??
					createTableModelContentFromPreparedSheet(sheet);
				if (!content) {
					continue;
				}
				const sheetId = getPreparedSheetId(sheet, index);
				const sheetName = getPreparedSheetName(sheet);
				sheets.push({
					content,
					sheetId,
					sheetName,
					sourceKey: toTableSourceKey({ resource, sheetId }),
				});
			}
			return sheets;
		}

		const content = createTableModelContentSnapshot(prepared.csvText ?? null, "csv") ??
			createTableModelContentFromPreparedFile(prepared);
		return content ? [{
			content,
			sheetId: sourceKey,
			sheetName: null,
			sourceKey,
		}] : [];
	}

	private async readPreparedSheetCsvText(
		sheet: FileConverterPreparedSheet,
	): Promise<string | null> {
		if (typeof sheet.csvText === "string") {
			return sheet.csvText;
		}
		const normalizedCsvPath = typeof sheet.normalizedCsvPath === "string"
			? sheet.normalizedCsvPath.trim()
			: "";
		if (!normalizedCsvPath || !this.fileConverterBackendService.canReadConvertedCsv()) {
			return null;
		}

		const result = await this.fileConverterBackendService.readConvertedCsv({
			path: normalizedCsvPath,
		});
		return result.ok && typeof result.csvText === "string" ? result.csvText : null;
	}
}

const createResourcePreviewInput = ({
	content,
	file,
	fileName,
	resource,
	sheetId,
	sheetName,
	stat,
}: {
	readonly content: TableModelContentSnapshot | null;
	readonly file: File;
	readonly fileName: string;
	readonly resource: URI;
	readonly sheetId?: string | null;
	readonly sheetName?: string | null;
	readonly stat: IFileStat;
}): TableModelPreviewInput => ({
	file,
	fileName,
	resource,
	relativePath: fileName,
	...(sheetId ? { sheetId } : {}),
	...(sheetName ? { sheetName } : {}),
	...(content ? {
		columnCount: content.columnCount,
		maxCellLengths: content.maxCellLengths,
		rowCount: content.rowCount,
		tableModelContent: content,
	} : {}),
	sourcePath: getResourcePath(resource),
	sourceVersion: normalizeResourceSourceVersion(stat.mtime),
});

const createFailedResourcePreviewInput = ({
	message,
	resource,
}: {
	readonly message: string;
	readonly resource: URI;
}): TableModelPreviewInput => {
	const fileName = getResourceFileName(resource);
	return {
		file: new File([], fileName, {
			lastModified: Date.now(),
			type: getResourceFileMimeType(fileName),
		}),
		fileName,
		resource,
		rawTableHealth: "decodeFailed",
		rawTableHealthMessage: message,
		relativePath: fileName,
		sourcePath: getResourcePath(resource),
		sourceVersion: 0,
	};
};

const readResourceAsBrowserFile = async ({
	fileName,
	fileService,
	resource,
	stat,
}: {
	readonly fileName: string;
	readonly fileService: IFileService;
	readonly resource: URI;
	readonly stat: IFileStat;
}): Promise<{ readonly file: File; readonly text: string | null }> => {
	const content = await fileService.readFile(resource, {
		encoding: tableFileFormatService.isExcel(resource) ? "base64" : "utf8",
	});
	if (!isFileContent(content)) {
		throw new Error("The file content could not be read.");
	}

	return {
		file: new File([toFilePart(content)], fileName, {
			lastModified: normalizeResourceSourceVersion(stat.mtime) || Date.now(),
			type: getResourceFileMimeType(fileName),
		}),
		text: content.encoding === "utf8" ? content.value : null,
	};
};

const isFileContent = (value: unknown): value is IFileContent => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<IFileContent>;
	return (candidate.encoding === "base64" || candidate.encoding === "utf8") &&
		typeof candidate.value === "string";
};

const toFilePart = (content: IFileContent): string | ArrayBuffer =>
	content.encoding === "base64" ? decodeBase64(content.value) : content.value;

const decodeBase64 = (value: string): ArrayBuffer => {
	const binary = globalThis.atob(value);
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return buffer;
};

const getResourceFileMimeType = (fileName: string): string => {
	if (tableFileFormatService.isExcel(fileName)) {
		return "application/octet-stream";
	}
	if (tableFileFormatService.isTsv(fileName)) {
		return "text/tab-separated-values;charset=utf-8";
	}
	return "text/csv;charset=utf-8";
};

const getPreparedSheets = (
	prepared: FileConverterPreparedFile,
): readonly FileConverterPreparedSheet[] => {
	if (Array.isArray(prepared.sheets)) {
		return prepared.sheets;
	}

	const manifest = prepared.manifest;
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return [];
	}

	const sheets = (manifest as { sheets?: unknown }).sheets;
	return Array.isArray(sheets)
		? sheets.filter((sheet): sheet is FileConverterPreparedSheet =>
			Boolean(sheet) && typeof sheet === "object" && !Array.isArray(sheet)
		)
		: [];
};

const getPreparedSheetId = (
	sheet: FileConverterPreparedSheet,
	fallbackIndex: number,
): string => {
	const index = Number.isInteger(sheet.sheetIndex)
		? Math.max(0, Number(sheet.sheetIndex))
		: fallbackIndex;
	const name = getPreparedSheetName(sheet);
	return name ? `${index}:${name}` : String(index);
};

const getPreparedSheetName = (
	sheet: FileConverterPreparedSheet,
): string | null =>
	typeof sheet.sheetName === "string" && sheet.sheetName.trim()
		? sheet.sheetName.trim()
		: null;

const createTableModelContentFromPreparedFile = (
	prepared: FileConverterPreparedFile,
): TableModelContentSnapshot | null =>
	createEmptyTableModelContentSnapshot(prepared.rowCount, prepared.columnCount, prepared.maxCellLengths);

const createTableModelContentFromPreparedSheet = (
	sheet: FileConverterPreparedSheet,
): TableModelContentSnapshot | null =>
	createEmptyTableModelContentSnapshot(sheet.rowCount, sheet.columnCount, sheet.maxCellLengths);
