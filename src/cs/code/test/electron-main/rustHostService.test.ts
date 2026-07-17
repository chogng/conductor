/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";

import { CancellationError } from "src/cs/base/common/errors";
import type {
	IRustWorkerHost,
	RustWorkerCommandHandle,
} from "src/cs/platform/rust/common/rustWorker";
import { RustHostService } from "src/cs/code/electron-main/rustHostService";

suite("code/test/electron-main/rustHostService", () => {
	const owner = { id: "renderer-1:frame-1", scope: "renderer-1" };

	test("cancels the structured-content command identified by the renderer request", async () => {
		const host = new TestRustWorkerHost();
		const service = new RustHostService({
			createOriginExportTempPath: () => "",
			isRustProcessFileConfigSupported: () => true,
			isSupportedInputPath: () => true,
			isSupportedStructuredContentPath: () => true,
			rustWorkerHost: host,
		});
		const response = service.resolveStructuredContent({
			fileName: "file.csv",
			inputPath: "C:\\workspace\\file.csv",
			requestId: "request-1",
		}, owner);

		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }, owner), true);
		assert.equal((await response).ok, false);
		assert.equal(host.cancelCount, 1);
		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }, owner), false);
	});

	test("isolates identical request ids by renderer owner", async () => {
		const host = new TestRustWorkerHost();
		const service = new RustHostService({
			createOriginExportTempPath: () => "",
			isRustProcessFileConfigSupported: () => true,
			isSupportedInputPath: () => true,
			isSupportedStructuredContentPath: () => true,
			rustWorkerHost: host,
		});
		const firstOwner = { id: "renderer-1:frame-1", scope: "renderer-1" };
		const secondOwner = { id: "renderer-2:frame-1", scope: "renderer-2" };
		const firstResponse = service.resolveStructuredContent({
			fileName: "first.csv",
			inputPath: "C:\\workspace\\first.csv",
			requestId: "request-1",
		}, firstOwner);
		const secondResponse = service.resolveStructuredContent({
			fileName: "second.csv",
			inputPath: "C:\\workspace\\second.csv",
			requestId: "request-1",
		}, secondOwner);

		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }, firstOwner), true);
		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }, firstOwner), false);
		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }, secondOwner), true);
		assert.equal((await firstResponse).ok, false);
		assert.equal((await secondResponse).ok, false);
		assert.equal(host.cancelCount, 2);
	});

	test("cancels every structured-content request owned by a renderer scope", async () => {
		const host = new TestRustWorkerHost();
		const service = new RustHostService({
			createOriginExportTempPath: () => "",
			isRustProcessFileConfigSupported: () => true,
			isSupportedInputPath: () => true,
			isSupportedStructuredContentPath: () => true,
			rustWorkerHost: host,
		});
		const firstOwner = { id: "renderer-1:frame-1", scope: "renderer-1" };
		const secondOwner = { id: "renderer-1:frame-2", scope: "renderer-1" };
		const otherOwner = { id: "renderer-2:frame-1", scope: "renderer-2" };
		const responses = [
			service.resolveStructuredContent({
				fileName: "first.csv",
				inputPath: "C:\\workspace\\first.csv",
				requestId: "request-1",
			}, firstOwner),
			service.resolveStructuredContent({
				fileName: "second.csv",
				inputPath: "C:\\workspace\\second.csv",
				requestId: "request-2",
			}, secondOwner),
			service.resolveStructuredContent({
				fileName: "other.csv",
				inputPath: "C:\\workspace\\other.csv",
				requestId: "request-3",
			}, otherOwner),
		];

		service.cancelStructuredContentOwner("renderer-1");

		assert.equal(host.cancelCount, 2);
		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }, firstOwner), false);
		assert.equal(await service.cancelStructuredContent({ requestId: "request-3" }, otherOwner), true);
		await Promise.all(responses);
		assert.equal(host.cancelCount, 3);
	});
});

class TestRustWorkerHost implements IRustWorkerHost {
	public declare readonly _serviceBrand: undefined;
	public cancelCount = 0;

	public startProcessingCommand(): RustWorkerCommandHandle {
		let rejectPromise!: (error: unknown) => void;
		const promise = new Promise<unknown>((_resolve, reject) => {
			rejectPromise = reject;
		});
		return {
			promise,
			cancel: () => {
				this.cancelCount += 1;
				rejectPromise(new CancellationError());
			},
		};
	}

	public sendProcessingCommand(): Promise<unknown> {
		return Promise.resolve({});
	}

	public disposeProcessingFile(): Promise<void> {
		return Promise.resolve();
	}

	public stop(): void {}
}
