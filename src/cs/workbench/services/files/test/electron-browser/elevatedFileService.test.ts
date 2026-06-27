/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
	FileSystemProviderCapabilities,
	FileType,
	type IFileContent,
	type IFileChange,
	type IFileService,
	type IFileStat,
	type IFileSystemProvider,
	type IReadFileOptions,
	type IWatchOptions,
	type IWriteFileOptions,
} from "src/cs/platform/files/common/files";
import type {
	INativeHostEnvironment,
	INativeHostService,
	INativeMessageBoxOptions,
	INativeMessageBoxResult,
	INativeOpenDialogOptions,
	INativeOpenDialogResult,
	INativeSaveDialogOptions,
	INativeSaveDialogResult,
	INativeWindowControlsOptions,
} from "src/cs/platform/native/common/native";
import { BrowserElevatedFileService } from "src/cs/workbench/services/files/browser/elevatedFileService";
import { NativeElevatedFileService } from "src/cs/workbench/services/files/electron-browser/elevatedFileService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/files/electron-browser/elevatedFileService", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("browser service is explicitly unsupported", async () => {
		const service = new BrowserElevatedFileService();
		const resource = URI.file("/workspace/protected.csv");

		assert.equal(service.isSupported(resource), false);
		await assert.rejects(
			() => service.writeFileElevated(resource, "value"),
			/Elevated file writes are not supported/,
		);
	});

	test("desktop service writes a temp source and delegates target write to native host", async () => {
		const fileService = new TestFileService();
		const nativeHostService = new TestNativeHostService("/user-data", fileService);
		const service = new NativeElevatedFileService(fileService, nativeHostService);
		const target = URI.file("/workspace/protected.csv");

		const stat = await service.writeFileElevated(target, "alpha,beta");

		assert.equal(service.isSupported(target), true);
		assert.equal(stat.path, target.fsPath);
		assert.deepEqual(fileService.directWrites.map(write => ({
			atomic: write.options?.atomic === true,
			resource: write.resource.toString(),
		})), [{
			atomic: true,
			resource: nativeHostService.writeElevatedCalls[0]?.source.toString(),
		}]);
		assert.deepEqual(nativeHostService.writeElevatedCalls.map(call => ({
			sourceRoot: call.source.path.startsWith("/user-data/"),
			target: call.target.toString(),
		})), [{
			sourceRoot: true,
			target: target.toString(),
		}]);
		assert.equal(fileService.existsSync(nativeHostService.writeElevatedCalls[0]?.source), false);
		assert.equal(fileService.getText(target), "alpha,beta");
	});
});

class TestFileService implements IFileService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidFilesChange = Event.None as Event<readonly IFileChange[]>;
	public readonly directWrites: Array<{ readonly resource: URI; readonly options: IWriteFileOptions | undefined }> = [];
	private readonly files = new Map<string, string>();

	public registerProvider(_scheme: string, _provider: IFileSystemProvider): IDisposable {
		return toDisposable(() => undefined);
	}

	public getProvider(_scheme: string): IFileSystemProvider | undefined {
		return undefined;
	}

	public getProviderCapabilities(): FileSystemProviderCapabilities {
		return FileSystemProviderCapabilities.FileRead |
			FileSystemProviderCapabilities.FileWrite |
			FileSystemProviderCapabilities.FileDelete |
			FileSystemProviderCapabilities.FileWatch;
	}

	public async exists(resource: URI): Promise<boolean> {
		return this.existsSync(resource);
	}

	public existsSync(resource: URI | undefined): boolean {
		return Boolean(resource && this.files.has(URI.revive(resource).toString()));
	}

	public async readDir(_resource: URI): Promise<readonly [string, FileType][]> {
		return [];
	}

	public async readFile(resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
		return {
			value: new TextEncoder().encode(this.getText(resource)),
		};
	}

	public async writeFile(resource: URI, content: string, options?: IWriteFileOptions): Promise<void> {
		this.directWrites.push({ resource: URI.revive(resource), options });
		this.setText(resource, content);
	}

	public async deleteFile(resource: URI): Promise<void> {
		this.files.delete(URI.revive(resource).toString());
	}

	public async moveFileToTrash(resource: URI): Promise<void> {
		await this.deleteFile(resource);
	}

	public async realpath(resource: URI): Promise<URI> {
		return URI.revive(resource);
	}

	public async stat(resource: URI): Promise<IFileStat> {
		const target = URI.revive(resource);
		const text = this.getText(target);
		return {
			ctime: 0,
			mtime: 0,
			path: target.fsPath,
			size: text.length,
			type: FileType.File,
		};
	}

	public watch(_resource: URI, _options?: IWatchOptions): IDisposable {
		return toDisposable(() => undefined);
	}

	public getText(resource: URI): string {
		return this.files.get(URI.revive(resource).toString()) ?? "";
	}

	public setText(resource: URI, content: string): void {
		this.files.set(URI.revive(resource).toString(), content);
	}
}

class TestNativeHostService implements INativeHostService {
	public declare readonly _serviceBrand: undefined;
	public readonly windowId = 1;
	public readonly writeElevatedCalls: Array<{ readonly source: URI; readonly target: URI }> = [];

	public constructor(
		private readonly userDataPath: string,
		private readonly fileService: TestFileService,
	) {}

	public async getEnvironment(): Promise<INativeHostEnvironment> {
		return {
			appVersion: "test",
			isDesktop: true,
			isPackaged: false,
			platform: "test",
			userDataPath: this.userDataPath,
		};
	}

	public async showOpenDialog(_options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult> {
		return { canceled: true, filePaths: [] };
	}

	public async showSaveDialog(_options: INativeSaveDialogOptions): Promise<INativeSaveDialogResult> {
		return { canceled: true };
	}

	public async showMessageBox(_options: INativeMessageBoxOptions): Promise<INativeMessageBoxResult> {
		return { response: 0 };
	}

	public async showItemInFolder(_path: string): Promise<void> {}

	public async writeElevated(source: URI, target: URI): Promise<void> {
		const revivedSource = URI.revive(source);
		const revivedTarget = URI.revive(target);
		this.writeElevatedCalls.push({ source: revivedSource, target: revivedTarget });
		this.fileService.setText(revivedTarget, this.fileService.getText(revivedSource));
	}

	public async toggleDevTools(): Promise<void> {}
	public async reloadWindow(): Promise<void> {}
	public async isMaximized(): Promise<boolean> { return false; }
	public async maximizeWindow(): Promise<void> {}
	public async unmaximizeWindow(): Promise<void> {}
	public async closeWindow(): Promise<void> {}
	public async minimizeWindow(): Promise<void> {}
	public async updateWindowControls(_options: INativeWindowControlsOptions): Promise<void> {}
}
