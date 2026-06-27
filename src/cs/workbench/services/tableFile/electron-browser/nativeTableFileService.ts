/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	type TableXlsReadResult,
	type TableXlsReader,
} from "src/cs/workbench/services/table/common/tableStructureParser";
import { tableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import {
	TableFileService,
} from "src/cs/workbench/services/tableFile/browser/tableFileService";
import {
	TableFileEditorModel,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModel";
import {
	type TableFileEditorModelManagerResolveOptions,
} from "src/cs/workbench/services/tableFile/common/tableFileEditorModelManager";
import {
	ITableFileService,
} from "src/cs/workbench/services/tableFile/common/tablefiles";

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const OLE_FREE_SECTOR = 0xffffffff;
const OLE_END_OF_CHAIN = 0xfffffffe;
const OLE_DIRECTORY_ENTRY_SIZE = 128;
const BIFF_RECORD_CONTINUE = 0x003c;

type OleDirectoryEntry = {
	readonly name: string;
	readonly objectType: number;
	readonly startSector: number;
	readonly streamSize: number;
};

type BiffRecord = {
	readonly data: Uint8Array;
	readonly id: number;
	readonly offset: number;
};

type BiffSheetReference = {
	readonly offset: number;
	readonly sheetId: string;
	readonly sheetName: string | null;
};

export class NativeTableFileService extends TableFileService {
	public constructor(
		@IFileService fileService: IFileService,
	) {
		super(fileService);
	}

	public override async resolveModel(
		model: TableFileEditorModel,
		options: TableFileEditorModelManagerResolveOptions = {},
	): Promise<void> {
		await super.resolveModel(model, tableFormatService.resolveFormat(model.resource) === "xls"
			? {
					...withoutXlsReader(options),
					xlsReader: options.xlsReader ?? readNativeXlsWorkbook,
				}
			: withoutXlsReader(options));
	}
}

const withoutXlsReader = (
	options: TableFileEditorModelManagerResolveOptions,
): TableFileEditorModelManagerResolveOptions => ({
	...(options.chunkSizeBytes === undefined ? {} : { chunkSizeBytes: options.chunkSizeBytes }),
	...(options.force === undefined ? {} : { force: options.force }),
	...(options.readMode === undefined ? {} : { readMode: options.readMode }),
});

export const readNativeXlsWorkbook: TableXlsReader = async ({ bytes }) =>
	readBiffWorkbook(readOleWorkbookStream(bytes));

const readOleWorkbookStream = (bytes: Uint8Array): Uint8Array => {
	if (!hasOleSignature(bytes)) {
		throw new Error("The xls workbook is not an OLE compound document.");
	}

	const sectorSize = 2 ** readUInt16LE(bytes, 0x1e);
	const miniSectorSize = 2 ** readUInt16LE(bytes, 0x20);
	const firstDirectorySector = readUInt32LE(bytes, 0x30);
	const miniStreamCutoff = readUInt32LE(bytes, 0x38);
	const firstMiniFatSector = readUInt32LE(bytes, 0x3c);
	const miniFatSectorCount = readUInt32LE(bytes, 0x40);
	const difatSectors = readDifatSectorIds(bytes, sectorSize);
	const fat = readFatEntries(bytes, sectorSize, difatSectors);
	const directoryBytes = readRegularSectorChain(bytes, sectorSize, fat, firstDirectorySector);
	const directory = readOleDirectory(directoryBytes);
	const root = directory.find(entry => entry.objectType === 5);
	const workbook = directory.find(entry =>
		entry.objectType === 2 && /^(book|workbook)$/i.test(entry.name)
	);
	if (!workbook) {
		throw new Error("The xls workbook stream was not found.");
	}

	if (
		workbook.streamSize > 0 &&
		workbook.streamSize < miniStreamCutoff &&
		root &&
		firstMiniFatSector !== OLE_END_OF_CHAIN &&
		firstMiniFatSector !== OLE_FREE_SECTOR
	) {
		const miniFatBytes = readRegularSectorChain(bytes, sectorSize, fat, firstMiniFatSector)
			.subarray(0, miniFatSectorCount * sectorSize);
		const miniFat = readSectorTable(miniFatBytes);
		const miniStream = readRegularSectorChain(bytes, sectorSize, fat, root.startSector)
			.subarray(0, root.streamSize);
		return readMiniSectorChain(miniStream, miniSectorSize, miniFat, workbook.startSector, workbook.streamSize);
	}

	return readRegularSectorChain(bytes, sectorSize, fat, workbook.startSector)
		.subarray(0, workbook.streamSize);
};

const hasOleSignature = (bytes: Uint8Array): boolean =>
	OLE_SIGNATURE.every((value, index) => bytes[index] === value);

const readDifatSectorIds = (
	bytes: Uint8Array,
	sectorSize: number,
): readonly number[] => {
	const sectors: number[] = [];
	for (let offset = 0x4c; offset < 0x200; offset += 4) {
		const sector = readUInt32LE(bytes, offset);
		if (sector !== OLE_FREE_SECTOR && sector !== OLE_END_OF_CHAIN) {
			sectors.push(sector);
		}
	}

	let nextDifatSector = readUInt32LE(bytes, 0x44);
	let guard = 0;
	while (
		nextDifatSector !== OLE_END_OF_CHAIN &&
		nextDifatSector !== OLE_FREE_SECTOR &&
		guard++ < 1024
	) {
		const sector = readSector(bytes, sectorSize, nextDifatSector);
		for (let offset = 0; offset < sectorSize - 4; offset += 4) {
			const fatSector = readUInt32LE(sector, offset);
			if (fatSector !== OLE_FREE_SECTOR && fatSector !== OLE_END_OF_CHAIN) {
				sectors.push(fatSector);
			}
		}
		nextDifatSector = readUInt32LE(sector, sectorSize - 4);
	}

	return sectors;
};

const readFatEntries = (
	bytes: Uint8Array,
	sectorSize: number,
	fatSectorIds: readonly number[],
): readonly number[] => {
	const entries: number[] = [];
	for (const sectorId of fatSectorIds) {
		const sector = readSector(bytes, sectorSize, sectorId);
		entries.push(...readSectorTable(sector));
	}
	return entries;
};

const readSectorTable = (bytes: Uint8Array): readonly number[] => {
	const entries: number[] = [];
	for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) {
		entries.push(readUInt32LE(bytes, offset));
	}
	return entries;
};

const readRegularSectorChain = (
	bytes: Uint8Array,
	sectorSize: number,
	fat: readonly number[],
	startSector: number,
): Uint8Array => {
	const chunks: Uint8Array[] = [];
	let sector = startSector;
	let guard = 0;
	while (
		sector !== OLE_END_OF_CHAIN &&
		sector !== OLE_FREE_SECTOR &&
		sector < fat.length &&
		guard++ < fat.length + 1
	) {
		chunks.push(readSector(bytes, sectorSize, sector));
		sector = fat[sector] ?? OLE_END_OF_CHAIN;
	}
	return concatBytes(chunks);
};

const readMiniSectorChain = (
	miniStream: Uint8Array,
	miniSectorSize: number,
	miniFat: readonly number[],
	startSector: number,
	streamSize: number,
): Uint8Array => {
	const chunks: Uint8Array[] = [];
	let sector = startSector;
	let guard = 0;
	while (
		sector !== OLE_END_OF_CHAIN &&
		sector !== OLE_FREE_SECTOR &&
		sector < miniFat.length &&
		guard++ < miniFat.length + 1
	) {
		const offset = sector * miniSectorSize;
		chunks.push(miniStream.subarray(offset, offset + miniSectorSize));
		sector = miniFat[sector] ?? OLE_END_OF_CHAIN;
	}
	return concatBytes(chunks).subarray(0, streamSize);
};

const readSector = (
	bytes: Uint8Array,
	sectorSize: number,
	sectorId: number,
): Uint8Array => {
	const offset = (sectorId + 1) * sectorSize;
	if (offset < 0 || offset + sectorSize > bytes.byteLength) {
		throw new Error("The xls workbook contains an invalid OLE sector chain.");
	}
	return bytes.subarray(offset, offset + sectorSize);
};

const readOleDirectory = (bytes: Uint8Array): readonly OleDirectoryEntry[] => {
	const entries: OleDirectoryEntry[] = [];
	for (let offset = 0; offset + OLE_DIRECTORY_ENTRY_SIZE <= bytes.byteLength; offset += OLE_DIRECTORY_ENTRY_SIZE) {
		const objectType = bytes[offset + 0x42] ?? 0;
		if (!objectType) {
			continue;
		}
		const nameLength = readUInt16LE(bytes, offset + 0x40);
		const name = readUtf16LeString(bytes.subarray(offset, offset + Math.max(0, nameLength - 2)));
		const streamSizeLow = readUInt32LE(bytes, offset + 0x78);
		const streamSizeHigh = readUInt32LE(bytes, offset + 0x7c);
		entries.push({
			name,
			objectType,
			startSector: readUInt32LE(bytes, offset + 0x74),
			streamSize: streamSizeHigh > 0
				? streamSizeHigh * 0x100000000 + streamSizeLow
				: streamSizeLow,
		});
	}
	return entries;
};

const readBiffWorkbook = (workbookStream: Uint8Array): TableXlsReadResult => {
	const records = readBiffRecords(workbookStream);
	const sharedStrings = readSharedStrings(records);
	const sheetReferences = readSheetReferences(records);
	if (!sheetReferences.length) {
		throw new Error("The xls workbook did not contain a readable worksheet.");
	}

	const sheets = sheetReferences.map(reference => ({
		rows: readBiffWorksheetRows(workbookStream, reference.offset, sharedStrings),
		sheetId: reference.sheetId,
		sheetName: reference.sheetName,
	}));
	if (!sheets.some(sheet => sheet.rows.length)) {
		throw new Error("The xls workbook did not contain a readable worksheet.");
	}
	return { sheets };
};

const readBiffWorksheetRows = (
	workbookStream: Uint8Array,
	sheetOffset: number,
	sharedStrings: readonly string[],
): readonly (readonly string[])[] => {
	const sheetRecords = readBiffRecords(workbookStream.subarray(sheetOffset), sheetOffset);
	const rows = new Map<number, string[]>();
	for (let index = 0; index < sheetRecords.length; index += 1) {
		const record = sheetRecords[index]!;
		if (record.id === 0x000a) {
			break;
		}

		switch (record.id) {
			case 0x00bd:
				readMulRkCells(record.data, rows);
				break;
			case 0x00fd:
				readLabelSstCell(record.data, sharedStrings, rows);
				break;
			case 0x0203:
				readNumberCell(record.data, rows);
				break;
			case 0x0204:
				readLabelCell(record.data, rows);
				break;
			case 0x0205:
				readBoolErrCell(record.data, rows);
				break;
			case 0x027e:
				readRkCell(record.data, rows);
				break;
		}
	}

	const materializedRows = Array.from(rows.entries())
		.sort(([left], [right]) => left - right)
		.map(([, row]) => trimTrailingEmptyCells(row));
	return materializedRows;
};

const readBiffRecords = (
	bytes: Uint8Array,
	baseOffset = 0,
): readonly BiffRecord[] => {
	const records: BiffRecord[] = [];
	for (let offset = 0; offset + 4 <= bytes.byteLength;) {
		const id = readUInt16LE(bytes, offset);
		const length = readUInt16LE(bytes, offset + 2);
		const dataOffset = offset + 4;
		if (dataOffset + length > bytes.byteLength) {
			break;
		}
		records.push({
			data: bytes.subarray(dataOffset, dataOffset + length),
			id,
			offset: baseOffset + offset,
		});
		offset = dataOffset + length;
	}
	return records;
};

const readSheetReferences = (records: readonly BiffRecord[]): readonly BiffSheetReference[] => {
	const sheets: BiffSheetReference[] = [];
	for (const record of records) {
		if (record.id !== 0x0085 || record.data.byteLength < 8) {
			continue;
		}
		const sheetType = record.data[5] ?? 0;
		if (sheetType !== 0) {
			continue;
		}
		sheets.push({
			offset: readUInt32LE(record.data, 0),
			sheetId: String(sheets.length),
			sheetName: readBoundSheetName(record.data),
		});
	}
	return sheets;
};

const readBoundSheetName = (data: Uint8Array): string | null => {
	const charCount = data[6] ?? 0;
	const flags = data[7] ?? 0;
	const bytesPerChar = flags & 0x01 ? 2 : 1;
	const start = 8;
	const end = start + charCount * bytesPerChar;
	if (end > data.byteLength) {
		return null;
	}
	const name = bytesPerChar === 2
		? readUtf16LeString(data.subarray(start, end))
		: readCompressedString(data.subarray(start, end));
	return name.trim() || null;
};

const readSharedStrings = (records: readonly BiffRecord[]): readonly string[] => {
	const sstRecordIndex = records.findIndex(record => record.id === 0x00fc);
	if (sstRecordIndex < 0) {
		return [];
	}

	const chunks = [records[sstRecordIndex]!.data];
	for (let index = sstRecordIndex + 1; records[index]?.id === BIFF_RECORD_CONTINUE; index += 1) {
		chunks.push(records[index]!.data);
	}
	const data = concatBytes(chunks);
	if (data.byteLength < 8) {
		return [];
	}
	const uniqueCount = readUInt32LE(data, 4);
	const values: string[] = [];
	let offset = 8;
	while (values.length < uniqueCount && offset < data.byteLength) {
		const parsed = readBiffUnicodeString(data, offset);
		values.push(parsed.text);
		offset = parsed.nextOffset;
	}
	return values;
};

const readBiffUnicodeString = (
	bytes: Uint8Array,
	offset: number,
): { readonly nextOffset: number; readonly text: string } => {
	const charCount = readUInt16LE(bytes, offset);
	const flags = bytes[offset + 2] ?? 0;
	let cursor = offset + 3;
	const hasWideChars = Boolean(flags & 0x01);
	const hasRichText = Boolean(flags & 0x08);
	const hasExtendedText = Boolean(flags & 0x04);
	const richTextRuns = hasRichText ? readUInt16LE(bytes, cursor) : 0;
	if (hasRichText) {
		cursor += 2;
	}
	const extendedTextSize = hasExtendedText ? readUInt32LE(bytes, cursor) : 0;
	if (hasExtendedText) {
		cursor += 4;
	}

	const charByteLength = charCount * (hasWideChars ? 2 : 1);
	const textBytes = bytes.subarray(cursor, cursor + charByteLength);
	const text = hasWideChars ? readUtf16LeString(textBytes) : readCompressedString(textBytes);
	return {
		nextOffset: cursor + charByteLength + richTextRuns * 4 + extendedTextSize,
		text,
	};
};

const readLabelSstCell = (
	data: Uint8Array,
	sharedStrings: readonly string[],
	rows: Map<number, string[]>,
): void => {
	if (data.byteLength < 10) {
		return;
	}
	setCell(
		rows,
		readUInt16LE(data, 0),
		readUInt16LE(data, 2),
		sharedStrings[readUInt32LE(data, 6)] ?? "",
	);
};

const readNumberCell = (
	data: Uint8Array,
	rows: Map<number, string[]>,
): void => {
	if (data.byteLength < 14) {
		return;
	}
	setCell(
		rows,
		readUInt16LE(data, 0),
		readUInt16LE(data, 2),
		formatCellNumber(readFloat64LE(data, 6)),
	);
};

const readRkCell = (
	data: Uint8Array,
	rows: Map<number, string[]>,
): void => {
	if (data.byteLength < 10) {
		return;
	}
	setCell(
		rows,
		readUInt16LE(data, 0),
		readUInt16LE(data, 2),
		formatCellNumber(decodeRkNumber(readUInt32LE(data, 6))),
	);
};

const readMulRkCells = (
	data: Uint8Array,
	rows: Map<number, string[]>,
): void => {
	if (data.byteLength < 10) {
		return;
	}
	const rowIndex = readUInt16LE(data, 0);
	const firstColumnIndex = readUInt16LE(data, 2);
	const lastColumnIndex = readUInt16LE(data, data.byteLength - 2);
	const cellCount = Math.max(0, lastColumnIndex - firstColumnIndex + 1);
	for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
		const offset = 4 + cellIndex * 6;
		if (offset + 6 > data.byteLength - 2) {
			break;
		}
		setCell(
			rows,
			rowIndex,
			firstColumnIndex + cellIndex,
			formatCellNumber(decodeRkNumber(readUInt32LE(data, offset + 2))),
		);
	}
};

const readLabelCell = (
	data: Uint8Array,
	rows: Map<number, string[]>,
): void => {
	if (data.byteLength < 8) {
		return;
	}
	const charCount = readUInt16LE(data, 6);
	const stringOffset = 8;
	const text = stringOffset + charCount <= data.byteLength
		? readCompressedString(data.subarray(stringOffset, stringOffset + charCount))
		: "";
	setCell(rows, readUInt16LE(data, 0), readUInt16LE(data, 2), text);
};

const readBoolErrCell = (
	data: Uint8Array,
	rows: Map<number, string[]>,
): void => {
	if (data.byteLength < 8) {
		return;
	}
	const value = data[6] ?? 0;
	const isError = data[7] === 1;
	setCell(rows, readUInt16LE(data, 0), readUInt16LE(data, 2), isError ? "#ERROR" : value ? "TRUE" : "FALSE");
};

const decodeRkNumber = (raw: number): number => {
	let value: number;
	if (raw & 0x02) {
		value = raw >> 2;
		if (value & 0x20000000) {
			value -= 0x40000000;
		}
	} else {
		const bytes = new Uint8Array(8);
		bytes[4] = raw & 0xfc;
		bytes[5] = (raw >> 8) & 0xff;
		bytes[6] = (raw >> 16) & 0xff;
		bytes[7] = (raw >> 24) & 0xff;
		value = readFloat64LE(bytes, 0);
	}
	return raw & 0x01 ? value / 100 : value;
};

const setCell = (
	rows: Map<number, string[]>,
	rowIndex: number,
	columnIndex: number,
	value: string,
): void => {
	const row = rows.get(rowIndex) ?? [];
	row[columnIndex] = value;
	rows.set(rowIndex, row);
};

const trimTrailingEmptyCells = (row: readonly (string | undefined)[]): readonly string[] => {
	let length = row.length;
	while (length > 0 && !String(row[length - 1] ?? "").trim()) {
		length -= 1;
	}
	return Array.from({ length }, (_, index) => row[index] ?? "");
};

const formatCellNumber = (value: number): string =>
	Number.isFinite(value) ? String(value) : "";

const concatBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
};

const readCompressedString = (bytes: Uint8Array): string => {
	let text = "";
	for (const byte of bytes) {
		text += String.fromCharCode(byte);
	}
	return text;
};

const readUtf16LeString = (bytes: Uint8Array): string => {
	let text = "";
	for (let offset = 0; offset + 1 < bytes.byteLength; offset += 2) {
		const code = bytes[offset]! | (bytes[offset + 1]! << 8);
		if (!code) {
			break;
		}
		text += String.fromCharCode(code);
	}
	return text;
};

const readUInt16LE = (bytes: Uint8Array, offset: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

const readUInt32LE = (bytes: Uint8Array, offset: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

const readFloat64LE = (bytes: Uint8Array, offset: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(offset, true);

registerSingleton(ITableFileService, NativeTableFileService, InstantiationType.Delayed);
