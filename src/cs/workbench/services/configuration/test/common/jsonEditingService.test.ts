/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
	FileChangeType,
	FileType,
	type IFileChange,
	type IFileContent,
	type IFileService,
	type IFileStat,
	type IReadFileOptions,
	type IWatchOptions,
} from "src/cs/platform/files/common/files";
import {
	JSONEditingError,
	JSONEditingErrorCode,
} from "src/cs/workbench/services/configuration/common/jsonEditing";
import { JSONEditingService } from "src/cs/workbench/services/configuration/common/jsonEditingService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class MemoryFileService implements IFileService {
	declare readonly _serviceBrand: undefined;

	private readonly files = new Map<string, string>();
	private readonly onDidFilesChangeEmitter = new Emitter<readonly IFileChange[]>();
	public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;

	public getWrittenContent(resource: URI): string | undefined {
		return this.files.get(URI.revive(resource).toString());
	}

	public setContent(resource: URI, content: string): void {
		this.files.set(URI.revive(resource).toString(), content);
	}

	public registerProvider(): IDisposable {
		return toDisposable(() => undefined);
	}

	public getProvider(): undefined {
		return undefined;
	}

	public async exists(resource: URI): Promise<boolean> {
		return this.files.has(URI.revive(resource).toString());
	}

	public async readDir(): Promise<readonly [string, FileType][]> {
		return [];
	}

	public async readFile(resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
		return {
			encoding: "utf8",
			value: this.files.get(URI.revive(resource).toString()) ?? "",
		};
	}

	public async writeFile(resource: URI, content: string): Promise<void> {
		this.files.set(URI.revive(resource).toString(), content);
		this.onDidFilesChangeEmitter.fire([{
			resource,
			type: FileChangeType.UPDATED,
		}]);
	}

	public async realpath(resource: URI): Promise<URI> {
		return resource;
	}

	public async stat(resource: URI): Promise<IFileStat> {
		return {
			ctime: 0,
			mtime: 0,
			path: URI.revive(resource).fsPath,
			size: this.files.get(URI.revive(resource).toString())?.length ?? 0,
			type: FileType.File,
		};
	}

	public watch(_resource: URI, _options?: IWatchOptions): IDisposable {
		return toDisposable(() => undefined);
	}
}

suite("workbench/services/configuration/common/jsonEditingService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("writes JSON path values through the file service", async () => {
		const resource = URI.file("C:\\Users\\test\\AppData\\Roaming\\Conductor Studio\\User\\settings.json");
		const files = new MemoryFileService();
		const service = new JSONEditingService(files);

		await service.write(resource, [{ path: ["editor", "tabSize"], value: 2 }], true);

		assert.equal(
			files.getWrittenContent(resource),
			"{\n  \"editor\": {\n    \"tabSize\": 2\n  }\n}\n",
		);
	});

	test("deletes values when the JSON value is undefined", async () => {
		const resource = URI.file("C:\\Users\\test\\AppData\\Roaming\\Conductor Studio\\User\\settings.json");
		const files = new MemoryFileService();
		files.setContent(resource, "{ \"editor\": { \"tabSize\": 2 } }");
		const service = new JSONEditingService(files);

		await service.write(resource, [{ path: ["editor", "tabSize"], value: undefined }], true);

		assert.equal(files.getWrittenContent(resource), "{\n  \"editor\": {}\n}\n");
	});

	test("rejects writes to invalid JSON files", async () => {
		const resource = URI.file("C:\\Users\\test\\AppData\\Roaming\\Conductor Studio\\User\\settings.json");
		const files = new MemoryFileService();
		files.setContent(resource, "{");
		const service = new JSONEditingService(files);

		await assert.rejects(
			() => service.write(resource, [{ path: ["editor.tabSize"], value: 2 }], true),
			(error: unknown) =>
				error instanceof JSONEditingError &&
				error.code === JSONEditingErrorCode.ERROR_INVALID_FILE,
		);
	});
});
