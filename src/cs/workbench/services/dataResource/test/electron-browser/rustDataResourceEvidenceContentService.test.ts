/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";

import { CancellationTokenSource } from "src/cs/base/common/cancellation";
import { isCancellationError } from "src/cs/base/common/errors";
import { Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	FileType,
	type IFileService,
} from "src/cs/platform/files/common/files";
import { RustDataResourceEvidenceContentService } from "src/cs/workbench/services/dataResource/electron-browser/rustDataResourceEvidenceContentService";

suite("workbench/services/dataResource/test/electron-browser/rustDataResourceEvidenceContentService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let originalWindow: PropertyDescriptor | undefined;

	setup(() => {
		originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	});

	teardown(() => {
		if (originalWindow) {
			Object.defineProperty(globalThis, "window", originalWindow);
		} else {
			delete (globalThis as { window?: unknown }).window;
		}
	});

	test("transfers an in-flight Rust resolve to a newer consumer", async () => {
		const bridge = new TestRustStructuredContentBridge();
		installWindowBridge(bridge);
		const service = store.add(new RustDataResourceEvidenceContentService(createFileService()));
		const resource = URI.file("C:\\workspace\\file.csv");
		const firstSource = store.add(new CancellationTokenSource());
		const first = service.createContentReference(resource, firstSource.token);
		await waitFor(() => bridge.requests.length === 1);
		const firstRejected = assert.rejects(first, error => isCancellationError(error));

		firstSource.cancel();
		const second = service.createContentReference(resource);
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.equal(bridge.cancelledRequestIds.length, 0);
		assert.equal(bridge.requests.length, 1);
		bridge.resolve(0);
		await firstRejected;
		const secondReference = await second;
		secondReference.dispose();
	});

	test("cancels an orphaned in-flight Rust resolve", async () => {
		const bridge = new TestRustStructuredContentBridge();
		installWindowBridge(bridge);
		const service = store.add(new RustDataResourceEvidenceContentService(createFileService()));
		const source = store.add(new CancellationTokenSource());
		const pending = service.createContentReference(
			URI.file("C:\\workspace\\orphan.csv"),
			source.token,
		);
		await waitFor(() => bridge.requests.length === 1);
		const rejected = assert.rejects(pending, error => isCancellationError(error));

		source.cancel();
		await rejected;
		await waitFor(() => bridge.cancelledRequestIds.length === 1);
		assert.deepEqual(bridge.cancelledRequestIds, [
			bridge.requests[0]?.requestId,
		]);
	});
});

type PendingBridgeRequest = {
	readonly requestId: string;
	readonly resolve: (response: {
		readonly code: string;
		readonly message: string;
		readonly ok: false;
	}) => void;
};

class TestRustStructuredContentBridge {
	public readonly cancelledRequestIds: string[] = [];
	public readonly requests: PendingBridgeRequest[] = [];

	public cancelStructuredContentWithRust = async (
		payload: { readonly requestId: string },
	): Promise<boolean> => {
		this.cancelledRequestIds.push(payload.requestId);
		return true;
	};

	public resolveStructuredContentWithRust = (
		payload: { readonly requestId: string },
	): Promise<{
		readonly code: string;
		readonly message: string;
		readonly ok: false;
	}> => new Promise(resolve => {
		this.requests.push({
			requestId: payload.requestId,
			resolve,
		});
	});

	public resolve(index: number): void {
		const request = this.requests[index];
		assert.ok(request);
		request.resolve({
			code: "TEST",
			message: "Test structured-content response.",
			ok: false,
		});
	}
}

function installWindowBridge(bridge: TestRustStructuredContentBridge): void {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			desktopImport: bridge,
		},
	});
}

function createFileService(): IFileService {
	return {
		onDidFilesChange: Event.None,
		stat: async (resource: URI) => ({
			ctime: 1,
			mtime: 1,
			path: resource.fsPath,
			size: 1,
			type: FileType.File,
		}),
	} as unknown as IFileService;
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	assert.fail("Timed out waiting for Rust DataResource state.");
}
