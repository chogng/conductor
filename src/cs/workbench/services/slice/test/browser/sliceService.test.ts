/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { joinPath } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	StorageScope,
	type IStorageService,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type {
	IWorkspaceContextService,
	IWorkspaceFoldersChangeEvent,
	IWorkspaceFoldersWillChangeEvent,
} from "src/cs/platform/workspace/common/workspace";
import type { IAnyWorkspaceIdentifier } from "src/cs/platform/workspaces/common/workspaceIdentifier";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import { SliceService } from "src/cs/workbench/services/slice/browser/sliceService";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";
import type {
	ITableModel,
	TableModelContentSnapshot,
	TableModelSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type {
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	SliceResourceRequest,
} from "src/cs/workbench/services/slice/common/slice";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type {
	IUserTemplateService,
	UserTemplateChangeEvent,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import { testStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/test/common/testStructuredContentEvidenceService";
import { TestDataResourceContentService } from "src/cs/workbench/services/dataResource/test/common/testDataResourceContentService";

type ResourceSheetIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

suite("workbench/services/slice/test/browser/sliceService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const settingsService = {
		onDidChangeConductorSettings: Event.None,
		getConductorSettings: () => null,
	} as unknown as ISettingsService;
	const createDataResourceServiceForTest = (
		tableModelService: ITableModelService,
	): DataResourceService =>
		store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService, false)),
			settingsService,
			testStructuredContentEvidenceService,
		));

	test("stores template selections by resource in Slice state", () => {
		const sliceService = store.add(new SliceService());
		const resource = { resource: URI.file("/workspace/file-a.csv"), sheetId: "sheet-a" };
		const changedResources: ResourceSheetIdentity[] = [];
		store.add(sliceService.onDidChangeTemplateSelection(changedResource => {
			changedResources.push(changedResource);
		}));

		assert.deepEqual(sliceService.getTemplateSelection(resource.resource, resource.sheetId), { kind: "auto" });

		sliceService.setTemplateSelection(resource.resource, resource.sheetId, {
			kind: "saved",
			templateId: "template-a",
		});
		sliceService.setTemplateSelection(resource.resource, resource.sheetId, {
			kind: "saved",
			templateId: "template-a",
		});

		const state = sliceService.getState();
		assert.deepEqual(sliceService.getTemplateSelection(resource.resource, resource.sheetId), {
			kind: "saved",
			templateId: "template-a",
		});
		assert.deepEqual(state.templateSelections.map(selection => ({
			resource: selection.resource.toString(),
			sheetId: selection.sheetId,
			selection: selection.selection,
		})), [{
			resource: resource.resource.toString(),
			sheetId: "sheet-a",
			selection: {
				kind: "saved",
				templateId: "template-a",
			},
		}]);
		assert.deepEqual(changedResources.map(changedResource => ({
			resource: changedResource.resource.toString(),
			sheetId: changedResource.sheetId,
		})), [{
			resource: resource.resource.toString(),
			sheetId: "sheet-a",
		}]);
	});

	test("persists saved template selections in the owning workspace", async () => {
		const storageService = store.add(new TestSliceStorageService("workspace-a"));
		const workspaceContextService = store.add(new TestSliceWorkspaceContextService(
			URI.file("/workspace-a"),
			storageService,
		));
		const sliceService = store.add(new SliceService(
			undefined,
			storageService,
			workspaceContextService as unknown as IWorkspaceContextService,
		));
		const resourceA = URI.file("/workspace-a/file.csv");
		const resourceB = URI.file("/workspace-b/file.csv");

		sliceService.setTemplateSelection(resourceA, "sheet-a", {
			kind: "saved",
			templateId: "template-a",
		});
		assert.equal(
			storageService.keys(StorageScope.WORKSPACE)
				.filter(key => key.startsWith("slice.templateSelection.v1:")).length,
			1,
		);

		await workspaceContextService.changeFolder(URI.file("/workspace-b"), "workspace-b");
		assert.deepEqual(sliceService.getTemplateSelection(resourceA, "sheet-a"), { kind: "auto" });
		sliceService.setTemplateSelection(resourceB, "sheet-a", {
			kind: "saved",
			templateId: "template-b",
		});

		await workspaceContextService.changeFolder(URI.file("/workspace-a"), "workspace-a");
		assert.deepEqual(sliceService.getTemplateSelection(resourceA, "sheet-a"), {
			kind: "saved",
			templateId: "template-a",
		});
		assert.deepEqual(sliceService.getTemplateSelection(resourceB, "sheet-a"), { kind: "auto" });

		sliceService.setTemplateSelection(resourceA, "sheet-a", { kind: "auto" });
		assert.equal(
			storageService.keys(StorageScope.WORKSPACE)
				.filter(key => key.startsWith("slice.templateSelection.v1:")).length,
			0,
		);
	});

	test("removes saved selections when their user template is deleted", () => {
		const storageService = store.add(new TestSliceStorageService("workspace-a"));
		const workspaceContextService = store.add(new TestSliceWorkspaceContextService(
			URI.file("/workspace-a"),
			storageService,
		));
		const onDidChangeUserTemplatesEmitter = store.add(new Emitter<UserTemplateChangeEvent>());
		const templateIds = new Set(["template-a"]);
		const userTemplateService = {
			onDidChangeUserTemplates: onDidChangeUserTemplatesEmitter.event,
			getTemplate: (templateId: string) =>
				templateIds.has(templateId) ? { id: templateId } : undefined,
		} as unknown as IUserTemplateService;
		const sliceService = store.add(new SliceService(
			undefined,
			storageService,
			workspaceContextService as unknown as IWorkspaceContextService,
			userTemplateService,
		));
		const resource = URI.file("/workspace-a/file.csv");
		sliceService.setTemplateSelection(resource, null, {
			kind: "saved",
			templateId: "template-a",
		});

		templateIds.delete("template-a");
		onDidChangeUserTemplatesEmitter.fire({
			version: 2,
			effectiveFingerprint: "",
		});

		assert.deepEqual(sliceService.getTemplateSelection(resource), { kind: "auto" });
		assert.equal(
			storageService.keys(StorageScope.WORKSPACE)
				.filter(key => key.startsWith("slice.templateSelection.v1:")).length,
			0,
		);
	});

	test("isolates in-flight queue work across workspace changes", async () => {
		const resourceA = URI.file("/workspace-a/source.csv");
		const resourceB = URI.file("/workspace-b/source.csv");
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new DeferredTableModelService());
		const storageService = store.add(new TestSliceStorageService("workspace-a"));
		const workspaceContextService = store.add(new TestSliceWorkspaceContextService(
			URI.file("/workspace-a"),
			storageService,
		));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
			storageService,
			workspaceContextService as unknown as IWorkspaceContextService,
		));
		const targetA = { resource: resourceA, sheetId: "sheet-a" };
		const targetB = { resource: resourceB, sheetId: "sheet-a" };

		sliceService.submitResource([createResourceSliceRequest(targetA)]);
		await waitUntil(() => sliceService.getResourceState(targetA.resource, targetA.sheetId)?.state === "processing");
		await workspaceContextService.changeFolder(URI.file("/workspace-b"), "workspace-b");
		sliceService.submitResource([createResourceSliceRequest(targetB)]);
		await waitUntil(() => sliceService.getResourceState(targetB.resource, targetB.sheetId)?.state === "processing");
		tableModelService.resolveNextReference({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "csv",
			loadState: { state: "ready", message: "" },
			resource: resourceA,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 1,
			version: 1,
		});
		tableModelService.resolveNextReference({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "csv",
			loadState: { state: "ready", message: "" },
			resource: resourceB,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 1,
			version: 1,
		});
		await waitUntil(() => sliceService.getResourceState(targetB.resource, targetB.sheetId)?.state === "ready");

		assert.equal(sliceService.getResourceResult(targetA.resource, targetA.sheetId), null);
		assert.equal(sliceService.getResourceState(targetA.resource, targetA.sheetId), undefined);
		assert.ok(sliceService.getResourceResult(targetB.resource, targetB.sheetId));
	});

	test("cleans queued resource state when the table model resource changes", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const resource = URI.file("/workspace/source.xlsx");
		const processingTarget = { resource, sheetId: "sheet-a" };
		const queuedTarget = { resource, sheetId: "sheet-b" };

		sliceService.submitResource([createResourceSliceRequest(processingTarget)]);
		await waitUntil(() => sliceService.getResourceState(processingTarget.resource, processingTarget.sheetId)?.state === "processing");
		sliceService.submitResource([createResourceSliceRequest(queuedTarget)]);
		assert.deepEqual(sliceService.getResourceState(queuedTarget.resource, queuedTarget.sheetId), { state: "queued" });

		tableModelService.fireModelChanged(resource);

		assert.equal(sliceService.getState().queueLength, 0);
		assert.equal(sliceService.getResourceState(queuedTarget.resource, queuedTarget.sheetId), undefined);
		assert.deepEqual(sliceService.getResourceState(processingTarget.resource, processingTarget.sheetId), { state: "processing" });
	});

	test("cancels queued resource slice requests by target", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const resource = URI.file("/workspace/source.xlsx");
		const processingTarget = { resource, sheetId: "sheet-a" };
		const queuedTarget = { resource, sheetId: "sheet-b" };

		sliceService.submitResource([createResourceSliceRequest(processingTarget)]);
		await waitUntil(() => sliceService.getResourceState(processingTarget.resource, processingTarget.sheetId)?.state === "processing");
		sliceService.submitResource([createResourceSliceRequest(queuedTarget)]);
		assert.deepEqual(sliceService.getResourceState(queuedTarget.resource, queuedTarget.sheetId), { state: "queued" });

		sliceService.cancelResource([queuedTarget]);

		assert.equal(sliceService.getState().queueLength, 0);
		assert.deepEqual(sliceService.getResourceState(queuedTarget.resource, queuedTarget.sheetId), { state: "none" });
		assert.deepEqual(sliceService.getResourceState(processingTarget.resource, processingTarget.sheetId), { state: "processing" });
	});

	test("matches queued resource slice state when request resource is structured cloned", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const resource = URI.file("/workspace/source.xlsx");
		const processingTarget = { resource, sheetId: "sheet-a" };
		const queuedTarget = {
			resource: resource.toJSON() as unknown as URI,
			sheetId: "sheet-b",
		};
		const queryTarget = { resource, sheetId: "sheet-b" };

		sliceService.submitResource([createResourceSliceRequest(processingTarget)]);
		await waitUntil(() => sliceService.getResourceState(processingTarget.resource, processingTarget.sheetId)?.state === "processing");
		sliceService.submitResource([createResourceSliceRequest(queuedTarget)]);

		assert.deepEqual(sliceService.getResourceState(queryTarget.resource, queryTarget.sheetId), { state: "queued" });

		sliceService.cancelResource([queryTarget]);

		assert.deepEqual(sliceService.getResourceState(queryTarget.resource, queryTarget.sheetId), { state: "none" });
	});

	test("reads only planned resource table row ranges from windowed content", async () => {
		const resource = URI.file("/workspace/large-source.xlsx");
		const rowCount = 1004;
		const template = createTemplate({
			startRow: 1001,
			endRow: 1003,
		});
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [4, 4],
			rowCount,
			rows: [],
			rowWindows: [{
				startRowIndex: 1001,
				rows: [
					["0", "1"],
					["1", "2"],
					["2", "3"],
				],
			}],
		};
		const tableModelService = store.add(new StaticTableModelService({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "xlsx",
			loadState: { state: "ready", message: "" },
			resource,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 7,
			version: 3,
		}));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const target = { resource, sheetId: "sheet-a" };

		sliceService.submitResource([createResourceSliceRequest(target, {
			rowCount,
			sourceModelVersion: 3,
			sourceVersion: 7,
			template,
		})]);

		await waitUntil(() => sliceService.getResourceState(target.resource, target.sheetId)?.state === "ready");
		const result = sliceService.getResourceResult(target.resource, target.sheetId);
		assert.equal(result?.run.errors.length, 0);
		assert.deepEqual(result?.curves[0]?.points, [
			{ x: 0, y: 1 },
			{ x: 1, y: 2 },
			{ x: 2, y: 3 },
		]);
	});

	test("fires resource result changes when resource results are stored and removed", async () => {
		const resource = URI.file("/workspace/source.xlsx");
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new StaticTableModelService({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "xlsx",
			loadState: { state: "ready", message: "" },
			resource,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 1,
			version: 1,
		}));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const target = { resource, sheetId: "sheet-a" };
		const changedResources: ResourceSheetIdentity[] = [];
		const listener = sliceService.onDidChangeResourceSliceResult(changedResource => {
			changedResources.push(changedResource);
		});
		sliceService.setTemplateSelection(target.resource, target.sheetId, {
			kind: "saved",
			templateId: "template-a",
		});

		sliceService.submitResource([createResourceSliceRequest(target)]);
		await waitUntil(() => sliceService.getResourceState(target.resource, target.sheetId)?.state === "ready");
		tableModelService.fireModelChanged(resource);
		listener.dispose();

		assert.equal(changedResources.length, 2);
		assert.deepEqual(changedResources.map(changedResource => changedResource.sheetId), ["sheet-a", "sheet-a"]);
		assert.deepEqual(changedResources.map(changedResource => changedResource.resource.toString()), [
			resource.toString(),
			resource.toString(),
		]);
		assert.equal(sliceService.getResourceResult(target.resource, target.sheetId), null);
		assert.deepEqual(sliceService.getTemplateSelection(target.resource, target.sheetId), {
			kind: "saved",
			templateId: "template-a",
		});
	});

	test("does not fall back to the default sheet when a resource slice sheet target is missing", async () => {
		const resource = URI.file("/workspace/source.xlsx");
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new StaticTableModelService({
			content,
			defaultSheetId: "sheet-a",
			diagnostics: [],
			format: "xlsx",
			loadState: { state: "ready", message: "" },
			resource,
			sheets: [{
				content,
				diagnostics: [],
				sheetId: "sheet-a",
				sheetName: "Sheet A",
			}],
			sourceVersion: 1,
			version: 1,
		}));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const target = { resource, sheetId: "missing-sheet" };

		sliceService.submitResource([createResourceSliceRequest(target)]);

		await waitUntil(() => sliceService.getResourceState(target.resource, target.sheetId)?.state === "failed");
		assert.equal(sliceService.getResourceState(target.resource, target.sheetId)?.state, "failed");
		assert.equal(sliceService.getResourceResult(target.resource, target.sheetId), null);
	});

	test("commits only the latest request for a resource", async () => {
		const resource = URI.file("/workspace/source.csv");
		const target = { resource, sheetId: "sheet-a" };
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new DeferredTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const firstRequest = {
			...createResourceSliceRequest(target),
			requestSignature: "request:first",
		};
		const latestRequest = {
			...createResourceSliceRequest(target),
			requestSignature: "request:latest",
		};

		sliceService.submitResource([firstRequest]);
		await waitUntil(() => sliceService.getResourceState(resource, "sheet-a")?.state === "processing");
		sliceService.submitResource([latestRequest]);
		tableModelService.resolveNextReference(createTableSnapshot(resource, content));
		await waitUntil(() => tableModelService.pendingReferenceCount === 1);
		tableModelService.resolveNextReference(createTableSnapshot(resource, content));
		await waitUntil(() => sliceService.getResourceState(resource, "sheet-a")?.state === "ready");

		assert.equal(sliceService.getResourceResult(resource, "sheet-a")?.requestSignature, "request:latest");
		assert.equal(sliceService.getState().isRunning, false);
	});

	test("keeps failed zero-curve executions out of chart results", async () => {
		const resource = URI.file("/workspace/invalid.csv");
		const target = { resource, sheetId: "sheet-a" };
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [4, 4],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["bad", "data"],
				["none", "none"],
			],
		};
		const tableModelService = store.add(new StaticTableModelService(
			createTableSnapshot(resource, content),
		));
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));

		sliceService.submitResource([createResourceSliceRequest(target)]);
		await waitUntil(() => sliceService.getResourceState(resource, "sheet-a")?.state === "failed");

		assert.equal(sliceService.getResourceResult(resource, "sheet-a"), null);
	});

	test("does not let stale processing overwrite an explicit skipped state", async () => {
		const resource = URI.file("/workspace/skipped.csv");
		const target = { resource, sheetId: "sheet-a" };
		const content: TableModelContentSnapshot = {
			columnCount: 2,
			maxCellLengths: [2, 2],
			rowCount: 3,
			rows: [
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			],
		};
		const tableModelService = store.add(new DeferredTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));

		sliceService.submitResource([createResourceSliceRequest(target)]);
		await waitUntil(() => sliceService.getResourceState(resource, "sheet-a")?.state === "processing");
		sliceService.markResourceSkipped(resource, "sheet-a", "slice.testSkipped", "Skipped.");
		tableModelService.resolveNextReference(createTableSnapshot(resource, content));
		await waitUntil(() => !sliceService.getState().isRunning);

		assert.deepEqual(sliceService.getResourceState(resource, "sheet-a"), {
			state: "skipped",
			code: "slice.testSkipped",
			message: "Skipped.",
		});
		assert.equal(sliceService.getResourceResult(resource, "sheet-a"), null);
	});

	test("puts the active explorer resource first in a bulk queue", async () => {
		const tableModelService = store.add(new BlockingTableModelService());
		const sliceService = store.add(new SliceService(
			createDataResourceServiceForTest(tableModelService),
		));
		const firstTarget = {
			resource: URI.file("/workspace/first.csv"),
			sheetId: "sheet-a",
		};
		const activeTarget = {
			resource: URI.file("/workspace/active.csv"),
			sheetId: "sheet-a",
		};

		sliceService.prioritizeResource(activeTarget.resource, activeTarget.sheetId);
		sliceService.submitResource([
			createResourceSliceRequest(firstTarget),
			createResourceSliceRequest(activeTarget),
		]);
		await waitUntil(() =>
			sliceService.getResourceState(activeTarget.resource, activeTarget.sheetId)?.state === "processing"
		);

		assert.deepEqual(
			sliceService.getResourceState(firstTarget.resource, firstTarget.sheetId),
			{ state: "queued" },
		);
	});
});

class TestSliceStorageService extends AbstractStorageService {
	private readonly values = new Map<string, string>();

	public constructor(
		private workspaceId: string,
	) {
		super();
	}

	public override async switchWorkspace(workspace: IAnyWorkspaceIdentifier): Promise<void> {
		this.workspaceId = workspace.id;
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(this.storageKey(key, scope));
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		this.values.set(this.storageKey(key, scope), value);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		this.values.delete(this.storageKey(key, scope));
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKey("", scope);
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	private storageKey(key: string, scope: StorageScope): string {
		const namespace = scope === StorageScope.WORKSPACE
			? this.workspaceId
			: "global";
		return `${namespace}:${scope}:${key}`;
	}
}

class TestSliceWorkspaceContextService extends Disposable {
	public declare readonly _serviceBrand: undefined;

	private readonly onWillChangeWorkspaceFoldersEmitter =
		this._register(new Emitter<IWorkspaceFoldersWillChangeEvent>());
	public readonly onWillChangeWorkspaceFolders =
		this.onWillChangeWorkspaceFoldersEmitter.event;
	private readonly onDidChangeWorkspaceFoldersEmitter =
		this._register(new Emitter<IWorkspaceFoldersChangeEvent>());
	public readonly onDidChangeWorkspaceFolders =
		this.onDidChangeWorkspaceFoldersEmitter.event;

	public constructor(
		private folder: URI,
		private readonly storageService: IStorageService,
	) {
		super();
	}

	public getWorkspaceRelativePath(resource: URI): string | null {
		const folderPath = this.folder.path.replace(/\/+$/, "");
		const resourcePath = URI.revive(resource).path;
		if (
			resource.scheme !== this.folder.scheme ||
			resource.authority !== this.folder.authority ||
			!resourcePath.startsWith(`${folderPath}/`)
		) {
			return null;
		}

		return resourcePath.slice(folderPath.length + 1);
	}

	public resolveWorkspaceRelativePath(relativePath: string): URI | null {
		const normalizedPath = relativePath.trim().replaceAll("\\", "/");
		if (
			!normalizedPath ||
			normalizedPath === ".." ||
			normalizedPath.startsWith("../") ||
			normalizedPath.startsWith("/")
		) {
			return null;
		}

		return joinPath(this.folder, normalizedPath);
	}

	public async changeFolder(folder: URI, workspaceId: string): Promise<void> {
		const changes: IWorkspaceFoldersChangeEvent = {
			added: [],
			removed: [],
			changed: [],
		};
		const joins: Promise<void>[] = [];
		this.onWillChangeWorkspaceFoldersEmitter.fire({
			changes,
			fromCache: false,
			join: promise => joins.push(promise),
		});
		await Promise.all(joins);
		await this.storageService.switchWorkspace({
			id: workspaceId,
			uri: folder,
		} as IAnyWorkspaceIdentifier);
		this.folder = folder;
		this.onDidChangeWorkspaceFoldersEmitter.fire(changes);
	}
}

const createTemplate = (
	options: {
		readonly startRow?: number;
		readonly endRow?: number | "end";
	} = {},
): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	measurement: {
		curveFamily: "iv",
		ivMode: "transfer",
	},
	blocks: [{
		rowRange: {
			startRow: options.startRow ?? 1,
			endRow: options.endRow ?? "end",
		},
		x: {
			columns: [0],
			unit: "V",
		},
		y: {
			columns: [1],
			unit: "A",
		},
		segmentation: {
			kind: "auto",
		},
		legend: {
			target: "auto",
		},
	}],
	stopOnError: false,
});

const createTestReviewFactors = () => ({
	selectorScore: 1,
	projectionScore: 1,
	semanticScore: 1,
	dataQualityScore: 1,
	parseHealthScore: 1,
	freshnessScore: 1,
	ambiguityPenalty: 0,
	conflictPenalty: 0,
	diagnosticPenalty: 0,
});

const createResourceSliceRequest = (
	target: ResourceSheetIdentity,
	options: {
		readonly rowCount?: number;
		readonly sourceModelVersion?: number;
		readonly sourceVersion?: number;
		readonly template?: Template;
	} = {},
): SliceResourceRequest => {
	const reviewedTemplate = createReviewedTemplate(options.template);
	const requestSignature = JSON.stringify({
		resource: target.resource.toString(),
		sheetId: target.sheetId ?? null,
		templateFingerprint: reviewedTemplate.templateFingerprint,
	});
	return {
		id: `slice-resource-request:${target.resource.toString()}:${target.sheetId ?? ""}`,
		resource: target.resource,
		sheetId: target.sheetId ?? null,
		reviewedTemplate,
		reviewSignature: "review:resource",
		trigger: {
			kind: "reviewDecision",
			reviewSignature: "review:resource",
			submittedBy: "system",
		},
		requestSignature,
		createdAt: 1,
		rowCount: options.rowCount ?? 3,
		columnCount: 2,
		sourceContentSignature: "source-content:resource",
		sourceModelVersion: options.sourceModelVersion ?? 1,
		sourceVersion: options.sourceVersion ?? 1,
	};
};

const createReviewedTemplate = (
	template = createTemplate(),
): ReviewedTemplate => {
	const templateFingerprint = createTemplateFingerprint(template);
	return {
		candidateId: "data-resource-candidate:binding-a",
		source: {
			kind: "dataResource",
			bindingCandidateId: "binding-a",
			semanticRulesFingerprint: "semantic:test",
		},
		template,
		templateFingerprint,
		review: {
			candidateId: "data-resource-candidate:binding-a",
			interpretationFingerprint: templateFingerprint,
			status: "ready",
			confidence: 0.95,
			factors: createTestReviewFactors(),
			findings: [],
			reasons: [],
			diagnostics: [],
		},
	};
};

class BlockingTableModelService implements ITableModelService {
	public declare readonly _serviceBrand: undefined;
	private readonly onDidChangeModelEmitter = new Emitter<ITableModel>();
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

	public canHandleResource(): boolean {
		return true;
	}

	public createModelReference(): Promise<ITableModelReference> {
		return new Promise(() => undefined);
	}

	public get(): ITableModel | undefined {
		return undefined;
	}

	public resolve(_resource: URI, _source?: TableSource | null): void {}

	public fireModelChanged(resource: URI): void {
		this.onDidChangeModelEmitter.fire({ resource } as ITableModel);
	}

	public dispose(): void {
		this.onDidChangeModelEmitter.dispose();
	}
}

class DeferredTableModelService implements ITableModelService {
	public declare readonly _serviceBrand: undefined;
	public readonly onDidChangeModel = Event.None as ITableModelService["onDidChangeModel"];
	private readonly pendingModelReferenceResolvers:
		Array<(reference: ITableModelReference) => void> = [];
	public get pendingReferenceCount(): number {
		return this.pendingModelReferenceResolvers.length;
	}

	public canHandleResource(): boolean {
		return true;
	}

	public createModelReference(): Promise<ITableModelReference> {
		return new Promise(resolve => {
			this.pendingModelReferenceResolvers.push(resolve);
		});
	}

	public get(): ITableModel | undefined {
		return undefined;
	}

	public resolve(_resource: URI, _source?: TableSource | null): void {}

	public resolveNextReference(snapshot: TableModelSnapshot): void {
		const resolveModelReference = this.pendingModelReferenceResolvers.shift();
		assert.ok(resolveModelReference);
		resolveModelReference({
			object: {
				resource: snapshot.resource,
				getSnapshot: () => snapshot,
			} as ITableModel,
			dispose: () => undefined,
		});
	}

	public dispose(): void {
		this.pendingModelReferenceResolvers.length = 0;
	}
}

const createTableSnapshot = (
	resource: URI,
	content: TableModelContentSnapshot,
): TableModelSnapshot => ({
	content,
	defaultSheetId: "sheet-a",
	diagnostics: [],
	format: "csv",
	loadState: { state: "ready", message: "" },
	resource,
	sheets: [{
		content,
		diagnostics: [],
		sheetId: "sheet-a",
		sheetName: "Sheet A",
	}],
	sourceVersion: 1,
	version: 1,
});

class StaticTableModelService implements ITableModelService {
	public declare readonly _serviceBrand: undefined;
	private readonly onDidChangeModelEmitter = new Emitter<ITableModel>();
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;

	public constructor(
		private readonly snapshot: TableModelSnapshot,
	) {}

	public canHandleResource(): boolean {
		return true;
	}

	public createModelReference(): Promise<ITableModelReference> {
		return Promise.resolve({
			object: {
				resource: this.snapshot.resource,
				getSnapshot: () => this.snapshot,
			} as ITableModel,
			dispose: () => undefined,
		});
	}

	public get(): ITableModel | undefined {
		return undefined;
	}

	public resolve(_resource: URI, _source?: TableSource | null): void {}

	public fireModelChanged(resource: URI): void {
		this.onDidChangeModelEmitter.fire({ resource } as ITableModel);
	}

	public dispose(): void {
		this.onDidChangeModelEmitter.dispose();
	}
}

const waitUntil = async (
	predicate: () => boolean,
): Promise<void> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	}

	assert.ok(predicate());
};
