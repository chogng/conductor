/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { FileService } from "src/cs/platform/files/common/fileService";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { UriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentityService";
import { WorkbenchState } from "src/cs/platform/workspace/common/workspace";
import type { IAnyWorkspaceIdentifier } from "src/cs/platform/workspaces/common/workspaceIdentifier";
import { WorkspaceContextService } from "src/cs/workbench/services/workspaces/browser/workspaceService";

suite("workbench/services/workspaces/browser/workspaceService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("owns the single-folder lifecycle and joins work before switching storage", async () => {
		const storageService = store.add(new TestStorageService());
		const fileService = store.add(new FileService());
		const workspaceService = store.add(new WorkspaceContextService(
			storageService,
			store.add(new UriIdentityService(fileService)),
		));
		const folder = URI.file("C:/workspace/data");
		let finishJoin: (() => void) | undefined;
		store.add(workspaceService.onWillChangeWorkspaceFolders(event => {
			if (event.changes.added.length === 0) {
				return;
			}
			event.join(new Promise<void>(resolve => {
				finishJoin = resolve;
			}));
		}));

		const opening = workspaceService.openFolder(folder);
		await Promise.resolve();
		assert.deepEqual(storageService.workspaceIds, []);

		finishJoin?.();
		await opening;
		assert.equal(workspaceService.getWorkbenchState(), WorkbenchState.FOLDER);
		assert.equal(
			workspaceService.getWorkspaceRelativePath(
				URI.file("C:/workspace/data/nested/transfer.csv"),
			),
			"nested/transfer.csv",
		);
		assert.equal(
			workspaceService.resolveWorkspaceRelativePath("nested/transfer.csv")?.fsPath,
			URI.file("C:/workspace/data/nested/transfer.csv").fsPath,
		);
		assert.equal(storageService.workspaceIds[0]?.startsWith("folder:"), true);

		await workspaceService.closeFolder();
		assert.equal(workspaceService.getWorkbenchState(), WorkbenchState.EMPTY);
		assert.equal(storageService.workspaceIds.at(-1), "empty-window");
	});
});

class TestStorageService extends AbstractStorageService {
	private readonly values = new Map<string, string>();
	public readonly workspaceIds: string[] = [];

	public override async switchWorkspace(
		workspace: IAnyWorkspaceIdentifier,
	): Promise<void> {
		this.workspaceIds.push(workspace.id);
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(`${scope}:${key}`);
	}

	protected writeValue(
		key: string,
		scope: StorageScope,
		value: string,
	): void {
		this.values.set(`${scope}:${key}`, value);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		this.values.delete(`${scope}:${key}`);
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = `${scope}:`;
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}
}
