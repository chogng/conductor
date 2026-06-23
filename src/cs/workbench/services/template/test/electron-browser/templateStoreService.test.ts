/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { getAppSettingsHome } from "src/cs/platform/environment/common/environmentService";
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
import type {
	INativeHostEnvironment,
	INativeHostService,
	INativeOpenDialogOptions,
	INativeOpenDialogResult,
} from "src/cs/platform/native/common/native";
import { JSONEditingService } from "src/cs/workbench/services/configuration/common/jsonEditingService";
import { createEmptyTemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import {
	TEMPLATE_FILENAME,
	type StoredTemplate,
} from "src/cs/workbench/services/template/common/templateStore";
import { ElectronTemplateStoreService } from "src/cs/workbench/services/template/electron-browser/templateStoreService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class MemoryFileService implements IFileService {
	declare readonly _serviceBrand: undefined;

	private readonly files = new Map<string, string>();
	private readonly onDidFilesChangeEmitter = new Emitter<readonly IFileChange[]>();
	public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;

	public getWrittenContent(resource: URI): string | undefined {
		return this.files.get(URI.revive(resource).toString());
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

	public async deleteFile(resource: URI): Promise<void> {
		this.files.delete(URI.revive(resource).toString());
		this.onDidFilesChangeEmitter.fire([{
			resource,
			type: FileChangeType.DELETED,
		}]);
	}

	public async moveFileToTrash(resource: URI): Promise<void> {
		await this.deleteFile(resource);
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

class TestNativeHostService implements INativeHostService {
	declare readonly _serviceBrand: undefined;
	public readonly windowId = 1;

	public constructor(private readonly userDataPath: string) {}

	public async getEnvironment(): Promise<INativeHostEnvironment> {
		return {
			appVersion: "test",
			isDesktop: true,
			isPackaged: false,
			platform: "win32",
			userDataPath: this.userDataPath,
		};
	}

	public async showOpenDialog(_options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult> {
		return { canceled: true, filePaths: [] };
	}

	public async showMessageBox(): Promise<{ readonly response: number }> {
		return { response: 0 };
	}

	public async showItemInFolder(): Promise<void> {}
	public async toggleDevTools(): Promise<void> {}
	public async reloadWindow(): Promise<void> {}
	public async isMaximized(): Promise<boolean> { return false; }
	public async maximizeWindow(): Promise<void> {}
	public async unmaximizeWindow(): Promise<void> {}
	public async closeWindow(): Promise<void> {}
	public async minimizeWindow(): Promise<void> {}
	public async updateWindowControls(): Promise<void> {}
}

suite("workbench/services/template/electron-browser/templateStoreService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("persists templates through JSON editing at User/template.json", async () => {
		const userDataPath = "C:\\Users\\test\\AppData\\Roaming\\Conductor Studio";
		const resource = URI.joinPath(getAppSettingsHome(userDataPath), TEMPLATE_FILENAME);
		const files = new MemoryFileService();
		const jsonEditingService = new JSONEditingService(files);
		const service = new ElectronTemplateStoreService(
			files,
			jsonEditingService,
			new TestNativeHostService(userDataPath),
		);

		assert.deepStrictEqual(await service.getTemplates(), []);
		assert.equal(files.getWrittenContent(resource), "{\n  \"templates\": [],\n  \"nextTemplateId\": 1\n}\n");

		const first = await service.saveTemplate(createEmptyTemplateApplyConfig({
			name: "Template",
			yColumns: [1],
		})) as StoredTemplate;
		const second = await service.saveTemplate(createEmptyTemplateApplyConfig({
			name: " template ",
			yColumns: [2],
		})) as StoredTemplate;
		const templates = await service.getTemplates() as StoredTemplate[];

		assert.equal(templates.length, 1);
		assert.equal(first.id, "1");
		assert.equal(second.id, first.id);
		assert.deepStrictEqual(templates[0].yColumns, [2]);
		assert.ok(files.getWrittenContent(resource)?.includes("\"templates\""));

		const renamed = await service.saveTemplate({
			...createEmptyTemplateApplyConfig({
				name: "Renamed Template",
				yColumns: [3],
			}),
			id: first.id,
		}) as StoredTemplate;
		const renamedTemplates = await service.getTemplates() as StoredTemplate[];

		assert.equal(renamed.id, first.id);
		assert.equal(renamedTemplates.length, 1);
		assert.equal(renamedTemplates[0].name, "Renamed Template");
		assert.deepStrictEqual(renamedTemplates[0].yColumns, [3]);

		await service.deleteTemplate(String(first.id));

		assert.deepStrictEqual(await service.getTemplates(), []);

		const next = await service.saveTemplate(createEmptyTemplateApplyConfig({
			name: "Next Template",
			yColumns: [4],
		})) as StoredTemplate;

		assert.equal(next.id, "2");
	});

	test("migrates legacy templates to stable stored ids", async () => {
		const userDataPath = "C:\\Users\\test\\AppData\\Roaming\\Conductor Studio";
		const resource = URI.joinPath(getAppSettingsHome(userDataPath), TEMPLATE_FILENAME);
		const files = new MemoryFileService();
		await files.writeFile(resource, JSON.stringify({
			templates: [{
				name: "Legacy Template",
				yColumns: [1],
			}],
		}));
		const service = new ElectronTemplateStoreService(
			files,
			new JSONEditingService(files),
			new TestNativeHostService(userDataPath),
		);

		const templates = await service.getTemplates() as StoredTemplate[];
		const persisted = JSON.parse(files.getWrittenContent(resource) || "{}");
		const loadedAgain = await service.getTemplates() as StoredTemplate[];

		assert.equal(templates.length, 1);
		assert.equal(templates[0].id, "1");
		assert.equal(persisted.templates[0].id, "1");
		assert.equal(persisted.nextTemplateId, 2);
		assert.equal(loadedAgain[0].id, "1");
	});
});
