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
		});

		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }), true);
		assert.equal((await response).ok, false);
		assert.equal(host.cancelCount, 1);
		assert.equal(await service.cancelStructuredContent({ requestId: "request-1" }), false);
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
