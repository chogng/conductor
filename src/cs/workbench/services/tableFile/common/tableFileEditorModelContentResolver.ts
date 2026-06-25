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
	type TableModelContentSnapshot,
	type TableModelPreviewInput,
} from "src/cs/workbench/services/table/common/tableModel";
import {
	parseTableModelContent,
	type ParsedTableModelContent,
} from "src/cs/workbench/services/table/common/tableModelContentParser";
import {
	type ITableFileEditorModelContentResolver,
	type TableModelResolvedContent,
	getResourceFileName,
	getResourcePath,
	normalizeResourceSourceVersion,
} from "src/cs/workbench/services/tablefile/common/tableFileEditorModel";
import { tableFileFormatService } from "src/cs/workbench/services/table/common/tableFileFormat";

export class TableFileEditorModelContentResolver implements ITableFileEditorModelContentResolver {
	public constructor(
		private readonly fileService: IFileService,
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

		const parsedContent = await parseTableModelContent({
			bytes: resourceFile.bytes,
			resource,
			sourceKey,
			text: resourceFile.text,
		});
		return createResolvedContent({
			file: resourceFile.file,
			fileName,
			parsedContent,
			resource,
			sourceKey,
			stat,
		});
	}
}

const createResolvedContent = ({
	file,
	fileName,
	parsedContent,
	resource,
	sourceKey,
	stat,
}: {
	readonly file: File;
	readonly fileName: string;
	readonly parsedContent: ParsedTableModelContent;
	readonly resource: URI;
	readonly sourceKey: string;
	readonly stat: IFileStat;
}): TableModelResolvedContent => {
	const previewInputsBySourceKey: [string, TableModelPreviewInput][] = [];
	let previewInput: TableModelPreviewInput | null = null;
	for (const sheet of parsedContent.sheets) {
		const hasDistinctSheetIdentity = sheet.sourceKey !== sourceKey || sheet.sheetName !== null;
		const sheetPreviewInput = createResourcePreviewInput({
			content: sheet.content,
			file,
			fileName,
			resource,
			...(hasDistinctSheetIdentity ? {
				sheetId: sheet.sheetId,
				sheetName: sheet.sheetName,
			} : {}),
			stat,
		});
		previewInputsBySourceKey.push([sheet.sourceKey, sheetPreviewInput]);
		previewInput ??= sheetPreviewInput;
	}

	if (!previewInput) {
		previewInput = createResourcePreviewInput({
			content: parsedContent.content,
			file,
			fileName,
			resource,
			stat,
		});
		previewInputsBySourceKey.push([sourceKey, previewInput]);
	}

	return {
		content: parsedContent.content,
		previewInput,
		previewInputsBySourceKey,
		sheets: parsedContent.sheets,
	};
};

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
}): Promise<{ readonly bytes: ArrayBuffer; readonly file: File; readonly text: string | null }> => {
	const content = await fileService.readFile(resource, {
		encoding: tableFileFormatService.isExcel(resource) ? "base64" : "utf8",
	});
	if (!isFileContent(content)) {
		throw new Error("The file content could not be read.");
	}

	const filePart = toFilePart(content);
	return {
		bytes: typeof filePart === "string" ? encodeText(filePart) : filePart,
		file: new File([filePart], fileName, {
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

const encodeText = (value: string): ArrayBuffer =>
	new TextEncoder().encode(value).buffer as ArrayBuffer;

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
