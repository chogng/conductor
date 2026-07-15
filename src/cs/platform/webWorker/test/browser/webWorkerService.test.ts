/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import {
	WebWorkerServer,
	type WebWorkerReplyMessage,
	type WebWorkerRequestMessage,
} from 'src/cs/base/common/worker/webWorker';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'src/cs/base/test/common/lifecycleTestUtils';
import { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import { WebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerServiceImpl';

interface TestWorkerProtocol {
	$echo(value: string): string;
}

suite('platform/webWorker/browser/webWorkerService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates a named module worker and correlates replies', async () => {
		const worker = new TestWorker();
		let createdUrl: string | URL | null = null;
		let createdOptions: WorkerOptions | null = null;
		const service = new WebWorkerService((url, options) => {
			createdUrl = url;
			createdOptions = options;
			return worker as unknown as Worker;
		});
		const client = store.add(service.createWorkerClient<TestWorkerProtocol>(descriptor));

		const result = client.proxy.$echo('value');
		const request = worker.messages[0]?.message;
		assert.equal(request?.type, 'request');
		assert.deepStrictEqual({
			args: request?.type === 'request' ? request.args : [],
			createdOptions,
			createdUrl: String(createdUrl),
			transferCount: worker.messages[0]?.transfer.length,
		}, {
			args: ['value'],
			createdOptions: { name: 'Test Worker', type: 'module' },
			createdUrl: 'test-worker.js',
			transferCount: 0,
		});

		worker.reply(request as WebWorkerRequestMessage, { result: 'done' });
		assert.equal(await result, 'done');
	});

	test('revives serialized worker errors', async () => {
		const worker = new TestWorker();
		const service = new WebWorkerService(() => worker as unknown as Worker);
		const client = store.add(service.createWorkerClient<TestWorkerProtocol>(descriptor));
		const result = client.proxy.$echo('value');
		const request = worker.messages[0]?.message as WebWorkerRequestMessage;

		worker.reply(request, {
			error: {
				$isError: true,
				code: 'TEST_FAILURE',
				message: 'Worker request failed.',
				name: 'TestError',
				noTelemetry: false,
			},
		});

		await assert.rejects(result, error => {
			assert.deepStrictEqual({
				code: (error as Error & { code?: string }).code,
				message: (error as Error).message,
				name: (error as Error).name,
			}, {
				code: 'TEST_FAILURE',
				message: 'Worker request failed.',
				name: 'TestError',
			});
			return true;
		});
	});

	test('rejects pending requests and terminates after fatal worker errors', async () => {
		const worker = new TestWorker();
		const service = new WebWorkerService(() => worker as unknown as Worker);
		const client = store.add(service.createWorkerClient<TestWorkerProtocol>(descriptor));
		const result = client.proxy.$echo('value');

		worker.onerror?.({ message: 'Worker crashed.' } as ErrorEvent);

		await assert.rejects(result, /Worker crashed\./);
		await assert.rejects(client.proxy.$echo('next'), /Worker crashed\./);
		assert.deepStrictEqual({
			terminateCount: worker.terminateCount,
		}, {
			terminateCount: 1,
		});
	});

	test('server transfers explicit results and serializes handler failures', async () => {
		const buffer = new ArrayBuffer(8);
		const replies: Array<{
			readonly message: WebWorkerReplyMessage;
			readonly transfer: readonly Transferable[];
		}> = [];
		const server = new WebWorkerServer(
			(message, transfer) => replies.push({ message, transfer }),
			{
				$buffer: () => ({ buffer }),
				$fail: () => {
					throw new Error('Handler failed.');
				},
			},
			{
				getTransferables: (method, result) => method === '$buffer'
					? [(result as { readonly buffer: ArrayBuffer }).buffer]
					: [],
			},
		);

		await server.onmessage(createRequest(1, '$buffer'));
		await server.onmessage(createRequest(2, '$fail'));

		assert.deepStrictEqual({
			firstResult: replies[0]?.message.result,
			firstTransfer: replies[0]?.transfer,
			secondError: replies[1]?.message.error,
		}, {
			firstResult: { buffer },
			firstTransfer: [buffer],
			secondError: {
				$isError: true,
				cause: undefined,
				code: undefined,
				message: 'Handler failed.',
				name: 'Error',
				noTelemetry: false,
				stack: (replies[1]?.message.error as Error & { stack?: string })?.stack,
			},
		});
	});
});

const descriptor = new WebWorkerDescriptor({
	esmModuleLocationBundler: 'test-worker.js',
	label: 'Test Worker',
});

class TestWorker {
	public onerror: ((event: ErrorEvent) => void) | null = null;
	public onmessage: ((event: MessageEvent) => void) | null = null;
	public onmessageerror: ((event: MessageEvent) => void) | null = null;
	public readonly messages: Array<{
		readonly message: WebWorkerRequestMessage | WebWorkerReplyMessage;
		readonly transfer: readonly Transferable[];
	}> = [];
	public terminateCount = 0;

	public postMessage(
		message: WebWorkerRequestMessage | WebWorkerReplyMessage,
		transfer: readonly Transferable[] = [],
	): void {
		this.messages.push({ message, transfer });
	}

	public reply(
		request: WebWorkerRequestMessage,
		reply: Pick<WebWorkerReplyMessage, 'error' | 'result'>,
	): void {
		this.onmessage?.({
			data: {
				...reply,
				requestId: request.requestId,
				type: 'reply',
				workerId: request.workerId,
			} satisfies WebWorkerReplyMessage,
		} as MessageEvent<WebWorkerReplyMessage>);
	}

	public terminate(): void {
		this.terminateCount += 1;
	}
}

function createRequest(requestId: number, method: string): WebWorkerRequestMessage {
	return {
		args: [],
		method,
		requestId,
		type: 'request',
		workerId: 1,
	};
}
