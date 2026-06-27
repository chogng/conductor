/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
	FileType,
	type IFileChange,
	type IFileContent,
	type IFileService,
	type IFileStat,
	type IReadFileOptions,
	type IWatchOptions,
} from "src/cs/platform/files/common/files";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	readTableFile,
} from "src/cs/workbench/services/tableFile/common/tableFileReader";
import {
	readTableByteBuffer,
	readTableTextBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";

suite("workbench/services/tableFile/test/common/tableFileReader", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("rejects known unsupported formats before reading file contents", async () => {
		const fileService = new TestFileService();
		const resource = URI.file("/workspace/legacy.xls");

		await assert.rejects(
			() => readTableFile(resource, fileService),
			/Unsupported table file/,
		);
		assert.equal(fileService.statCount, 0);
		assert.equal(fileService.readCount, 0);
	});

	test("reads workbook resources as table byte buffers", async () => {
		const fileService = new TestFileService("workbook-bytes");
		const resource = URI.file("/workspace/workbook.xlsx");

		const result = await readTableFile(resource, fileService);

		assert.equal(result.buffer.kind, "bytes");
		if (result.buffer.kind !== "bytes") {
			assert.fail("Expected a byte table buffer.");
		}
		assert.equal(new TextDecoder().decode(await readTableByteBuffer(result.buffer)), "workbook-bytes");
		assert.equal(fileService.statCount, 1);
		assert.equal(fileService.readCount, 1);
	});

	test("reads large text resources as table text chunks", async () => {
		const content = "Vg,Id\r\n0,1\r\n1,2";
		const fileService = new TestFileService(content);
		const resource = URI.file("/workspace/transfer.csv");

		const result = await readTableFile(resource, fileService, {
			chunkSizeBytes: 6,
		});

		assert.equal(result.buffer.kind, "text");
		if (result.buffer.kind !== "text") {
			assert.fail("Expected a text table buffer.");
		}
		assert.equal(await readTableTextBuffer(result.buffer), content);
		const lineStarts: number[] = [];
		for await (const chunk of result.buffer.chunks ?? []) {
			lineStarts.push(chunk.lineStart);
		}
		assert.deepEqual(lineStarts, [1, 2, 3]);
		assert.deepEqual(fileService.readRanges, [
			{ position: 0, length: 6 },
			{ position: 6, length: 6 },
			{ position: 12, length: 3 },
		]);
	});

	test("reads large workbook resources as table byte chunks", async () => {
		const content = "workbook-bytes";
		const fileService = new TestFileService(content);
		const resource = URI.file("/workspace/workbook.xlsx");

		const result = await readTableFile(resource, fileService, {
			chunkSizeBytes: 4,
		});

		assert.equal(result.buffer.kind, "bytes");
		if (result.buffer.kind !== "bytes") {
			assert.fail("Expected a byte table buffer.");
		}
		assert.equal(new TextDecoder().decode(await readTableByteBuffer(result.buffer)), content);
		assert.deepEqual(fileService.readRanges, [
			{ position: 0, length: 4 },
			{ position: 4, length: 4 },
			{ position: 8, length: 4 },
			{ position: 12, length: 2 },
		]);
	});
});

class TestFileService implements IFileService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidFilesChange = Event.None as Event<readonly IFileChange[]>;
	public statCount = 0;
	public readCount = 0;
	public readonly readRanges: { readonly position: number | undefined; readonly length: number | undefined }[] = [];

	public constructor(
		private readonly content: string | Uint8Array = "Vg,Id\n0,1",
	) {}

	public registerProvider(): never {
		throw new Error("Unexpected registerProvider.");
	}

	public getProvider(): undefined {
		return undefined;
	}

	public async exists(): Promise<boolean> {
		return true;
	}

	public async readDir(): Promise<readonly [string, FileType][]> {
		return [];
	}

	public async readFile(_resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
		this.readCount += 1;
		this.readRanges.push({
			position: options?.position,
			length: options?.length,
		});
		const bytes = this.getContentBytes();
		const position = Math.max(0, Math.floor(Number(options?.position) || 0));
		const length = options?.length === undefined
			? bytes.byteLength - position
			: Math.max(0, Math.floor(Number(options.length) || 0));
		const slice = bytes.subarray(position, Math.min(bytes.byteLength, position + length));
		return {
			value: slice,
		};
	}

	public async writeFile(): Promise<void> {}

	public async deleteFile(): Promise<void> {}

	public async moveFileToTrash(): Promise<void> {}

	public async realpath(resource: URI): Promise<URI> {
		return resource;
	}

	public async stat(resource: URI): Promise<IFileStat> {
		this.statCount += 1;
		const size = this.getContentSize();
		return {
			ctime: 1,
			mtime: 1,
			path: resource.path,
			size,
			type: FileType.File,
		};
	}

	public watch(_resource: URI, _options?: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	private getContentBytes(): Uint8Array {
		return typeof this.content === "string"
			? new TextEncoder().encode(this.content)
			: this.content;
	}

	private getContentSize(): number {
		try {
			return this.getContentBytes().byteLength;
		} catch {
			return 0;
		}
	}
}
