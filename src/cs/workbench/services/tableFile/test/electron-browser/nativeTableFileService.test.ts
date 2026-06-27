/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	FileSystemProviderCapabilities,
	FileType,
	type IFileChange,
	type IFileContent,
	type IFileService,
	type IFileStat,
	type IReadFileOptions,
	type IWatchOptions,
} from "src/cs/platform/files/common/files";
import {
	NativeTableFileService,
	readNativeXlsWorkbook,
} from "src/cs/workbench/services/tableFile/electron-browser/nativeTableFileService";

suite("workbench/services/tableFile/test/electron-browser/nativeTableFileService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("reads a minimal BIFF/OLE xls workbook to sheet rows", async () => {
		const workbook = await readNativeXlsWorkbook({
			bytes: createMinimalBiff8OleWorkbook(),
		});

		assert.deepEqual(workbook.sheets, [{
			rows: [["Name", "Value"], ["A", "42"]],
			sheetId: "0",
			sheetName: "Sheet1",
		}]);
	});

	test("opens binary xls resources through the native table file service", async () => {
		const resource = URI.file("/workspace/native.xls");
		const tableFileService = store.add(new NativeTableFileService(
			new TestFileService(createMinimalBiff8OleWorkbook()),
		));
		const editorModel = tableFileService.getOrCreateFileEditorModel(resource);

		await tableFileService.resolveModel(editorModel);

		assert.deepEqual(editorModel.model.getSnapshot().content?.rows, [
			["Name", "Value"],
			["A", "42"],
		]);
	});
});

class TestFileService implements IFileService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidFilesChange = Event.None as Event<readonly IFileChange[]>;

	public constructor(
		private readonly content: Uint8Array,
	) {}

	public registerProvider(): never {
		throw new Error("Unexpected registerProvider.");
	}

	public getProvider(): undefined {
		return undefined;
	}

	public getProviderCapabilities(): FileSystemProviderCapabilities {
		return FileSystemProviderCapabilities.FileRead |
			FileSystemProviderCapabilities.FileReadRange |
			FileSystemProviderCapabilities.FileWatch;
	}

	public async exists(): Promise<boolean> {
		return true;
	}

	public async readDir(): Promise<readonly [string, FileType][]> {
		return [];
	}

	public async readFile(_resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
		const position = Math.max(0, Math.floor(Number(options?.position) || 0));
		const length = options?.length === undefined
			? this.content.byteLength - position
			: Math.max(0, Math.floor(Number(options.length) || 0));
		return {
			value: this.content.subarray(position, Math.min(this.content.byteLength, position + length)),
		};
	}

	public async writeFile(): Promise<void> {}

	public async deleteFile(): Promise<void> {}

	public async moveFileToTrash(): Promise<void> {}

	public async realpath(resource: URI): Promise<URI> {
		return resource;
	}

	public async stat(): Promise<IFileStat> {
		return {
			ctime: 1,
			mtime: 1,
			path: "/workspace/native.xls",
			size: this.content.byteLength,
			type: FileType.File,
		};
	}

	public watch(_resource: URI, _options?: IWatchOptions) {
		return { dispose: () => undefined };
	}
}

const createMinimalBiff8OleWorkbook = (): Uint8Array => {
	const workbook = createMinimalBiff8WorkbookStream();
	const sectorSize = 512;
	const bytes = new Uint8Array(sectorSize * 4);
	bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
	bytes.fill(0xff, 0x4c, 0x200);
	writeUInt16LE(bytes, 0x1a, 3);
	writeUInt16LE(bytes, 0x1c, 0xfffe);
	writeUInt16LE(bytes, 0x1e, 9);
	writeUInt16LE(bytes, 0x20, 6);
	writeUInt32LE(bytes, 0x2c, 1);
	writeUInt32LE(bytes, 0x30, 1);
	writeUInt32LE(bytes, 0x38, 0);
	writeUInt32LE(bytes, 0x3c, 0xfffffffe);
	writeUInt32LE(bytes, 0x44, 0xfffffffe);
	writeUInt32LE(bytes, 0x4c, 2);

	bytes.set(workbook, sectorSize);
	writeOleDirectoryEntry(bytes, sectorSize * 2, "Root Entry", 5, 0xffffffff, 0);
	writeOleDirectoryEntry(bytes, sectorSize * 2 + 128, "Workbook", 2, 0, workbook.byteLength);
	bytes.fill(0xff, sectorSize * 3, sectorSize * 4);
	writeUInt32LE(bytes, sectorSize * 3, 0xfffffffe);
	writeUInt32LE(bytes, sectorSize * 3 + 4, 0xfffffffe);
	writeUInt32LE(bytes, sectorSize * 3 + 8, 0xfffffffd);
	return bytes;
};

const createMinimalBiff8WorkbookStream = (): Uint8Array => {
	const sheet = concatBytes([
		createBofRecord(0x0010),
		createLabelSstRecord(0, 0, 0),
		createLabelSstRecord(0, 1, 1),
		createLabelSstRecord(1, 0, 2),
		createNumberRecord(1, 1, 42),
		createRecord(0x000a, new Uint8Array()),
	]);
	const globalsBof = createBofRecord(0x0005);
	const sst = createSstRecord(["Name", "Value", "A"]);
	const globalsEof = createRecord(0x000a, new Uint8Array());
	const sheetOffset = globalsBof.byteLength +
		createBoundSheetRecord(0, "Sheet1").byteLength +
		sst.byteLength +
		globalsEof.byteLength;
	return concatBytes([
		globalsBof,
		createBoundSheetRecord(sheetOffset, "Sheet1"),
		sst,
		globalsEof,
		sheet,
	]);
};

const createBofRecord = (substreamType: number): Uint8Array => {
	const payload = new Uint8Array(16);
	writeUInt16LE(payload, 0, 0x0600);
	writeUInt16LE(payload, 2, substreamType);
	writeUInt16LE(payload, 4, 0x0dbb);
	writeUInt16LE(payload, 6, 0x07cc);
	writeUInt32LE(payload, 8, 0x00000041);
	writeUInt32LE(payload, 12, 0x00000006);
	return createRecord(0x0809, payload);
};

const createBoundSheetRecord = (
	sheetOffset: number,
	name: string,
): Uint8Array => {
	const payload = new Uint8Array(8 + name.length);
	writeUInt32LE(payload, 0, sheetOffset);
	payload[5] = 0;
	payload[6] = name.length;
	payload[7] = 0;
	for (let index = 0; index < name.length; index += 1) {
		payload[8 + index] = name.charCodeAt(index);
	}
	return createRecord(0x0085, payload);
};

const createSstRecord = (values: readonly string[]): Uint8Array => {
	const strings = values.map(createBiffString);
	const payload = new Uint8Array(8 + strings.reduce((sum, item) => sum + item.byteLength, 0));
	writeUInt32LE(payload, 0, values.length);
	writeUInt32LE(payload, 4, values.length);
	let offset = 8;
	for (const string of strings) {
		payload.set(string, offset);
		offset += string.byteLength;
	}
	return createRecord(0x00fc, payload);
};

const createBiffString = (value: string): Uint8Array => {
	const bytes = new Uint8Array(3 + value.length);
	writeUInt16LE(bytes, 0, value.length);
	bytes[2] = 0;
	for (let index = 0; index < value.length; index += 1) {
		bytes[3 + index] = value.charCodeAt(index);
	}
	return bytes;
};

const createLabelSstRecord = (
	rowIndex: number,
	columnIndex: number,
	sharedStringIndex: number,
): Uint8Array => {
	const payload = new Uint8Array(10);
	writeUInt16LE(payload, 0, rowIndex);
	writeUInt16LE(payload, 2, columnIndex);
	writeUInt32LE(payload, 6, sharedStringIndex);
	return createRecord(0x00fd, payload);
};

const createNumberRecord = (
	rowIndex: number,
	columnIndex: number,
	value: number,
): Uint8Array => {
	const payload = new Uint8Array(14);
	writeUInt16LE(payload, 0, rowIndex);
	writeUInt16LE(payload, 2, columnIndex);
	new DataView(payload.buffer).setFloat64(6, value, true);
	return createRecord(0x0203, payload);
};

const createRecord = (
	id: number,
	payload: Uint8Array,
): Uint8Array => {
	const bytes = new Uint8Array(4 + payload.byteLength);
	writeUInt16LE(bytes, 0, id);
	writeUInt16LE(bytes, 2, payload.byteLength);
	bytes.set(payload, 4);
	return bytes;
};

const writeOleDirectoryEntry = (
	bytes: Uint8Array,
	offset: number,
	name: string,
	objectType: number,
	startSector: number,
	streamSize: number,
): void => {
	for (let index = 0; index < name.length; index += 1) {
		writeUInt16LE(bytes, offset + index * 2, name.charCodeAt(index));
	}
	writeUInt16LE(bytes, offset + name.length * 2, 0);
	writeUInt16LE(bytes, offset + 0x40, (name.length + 1) * 2);
	bytes[offset + 0x42] = objectType;
	writeUInt32LE(bytes, offset + 0x74, startSector);
	writeUInt32LE(bytes, offset + 0x78, streamSize);
};

const concatBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
	const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
};

const writeUInt16LE = (
	bytes: Uint8Array,
	offset: number,
	value: number,
): void => {
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
};

const writeUInt32LE = (
	bytes: Uint8Array,
	offset: number,
	value: number,
): void => {
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
};
