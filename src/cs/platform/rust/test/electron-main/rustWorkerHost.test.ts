/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

import {
	RustWorkerHost,
	resolveRustProcessingPoolSize,
	resolveRustWorkerExecutablePath,
} from "src/cs/platform/rust/electron-main/rustWorkerHost";
import { isCancellationError } from "src/cs/base/common/errors";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/rust/electron-main/rustWorkerHost", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	const helperFileName = "conductor-rs.exe";
	let root: string;

	setup(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-rust-worker-"));
	});

	teardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test("resolves staged development helper from resources bin", () => {
		const helperPath = touch(path.join(root, "resources", "bin", helperFileName));

		assert.equal(resolveRustWorkerExecutablePath({
			appRootPath: root,
			env: {},
			isDev: true,
			platform: "win32",
			resourcesPath: path.join(root, "out"),
		}), helperPath);
	});

	test("prefers build cache output before tooling output in development", () => {
		const buildCachePath = touch(path.join(
			root,
			".build",
			"cache",
			"conductor-rs-cli-target",
			"release",
			helperFileName,
		));
		touch(path.join(root, ".tooling", "conductor-rs-cli-target", "release", helperFileName));

		assert.equal(resolveRustWorkerExecutablePath({
			appRootPath: root,
			env: {},
			isDev: true,
			platform: "win32",
			resourcesPath: path.join(root, "out"),
		}), buildCachePath);
	});

	test("resolves adaptive processing pool size from available parallelism", () => {
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: Number.NaN }), 2);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 1 }), 1);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 2 }), 2);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8 }), 8);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 16 }), 16);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 64 }), 64);
	});

	test("resolves processing pool size from environment override without a fixed cap", () => {
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "1" }), 1);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "6" }), 6);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "64" }), 64);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "invalid" }), 8);
	});

	test("cancels one active command by replacing its exclusive worker slot", async () => {
		const processes: TestRustWorkerProcess[] = [];
		const host = new RustWorkerHost({
			isWindows: false,
			processingPoolSize: 1,
			resolveExecutablePath: () => "test-conductor-rs",
			spawnProcessingWorker: () => {
				const process = new TestRustWorkerProcess();
				processes.push(process);
				return process as unknown as ChildProcessWithoutNullStreams;
			},
		});
		const first = host.startProcessingCommand("first");
		const firstRejected = assert.rejects(first.promise, error => isCancellationError(error));
		const second = host.startProcessingCommand("second");

		assert.equal(processes.length, 1);
		assert.deepEqual(processes[0]?.commands.map(command => command.command), ["first"]);
		first.cancel();

		await firstRejected;
		await waitFor(() => processes.length === 2 && processes[1]?.commands.length === 1);
		assert.equal(processes[0]?.killed, true);
		assert.deepEqual(processes[1]?.commands.map(command => command.command), ["second"]);
		processes[1]?.respond(0, { value: 2 });
		assert.deepEqual(await second.promise, { value: 2 });
		host.stop();
	});

	test("ignores a replaced worker exit after the next command starts", async () => {
		const processes: TestRustWorkerProcess[] = [];
		const host = new RustWorkerHost({
			isWindows: false,
			processingPoolSize: 1,
			resolveExecutablePath: () => "test-conductor-rs",
			spawnProcessingWorker: () => {
				const process = new TestRustWorkerProcess(processes.length !== 0);
				processes.push(process);
				return process as unknown as ChildProcessWithoutNullStreams;
			},
		});
		const first = host.startProcessingCommand("first");
		const firstRejected = assert.rejects(first.promise, error => isCancellationError(error));
		const second = host.startProcessingCommand("second");

		first.cancel();
		await firstRejected;
		await waitFor(() => processes.length === 2 && processes[1]?.commands.length === 1);

		processes[0]?.exit();
		processes[1]?.respond(0, { value: 2 });
		assert.deepEqual(await second.promise, { value: 2 });
		host.stop();
	});

	test("cancels a queued command without stopping the active worker", async () => {
		const processes: TestRustWorkerProcess[] = [];
		const host = new RustWorkerHost({
			isWindows: false,
			processingPoolSize: 1,
			resolveExecutablePath: () => "test-conductor-rs",
			spawnProcessingWorker: () => {
				const process = new TestRustWorkerProcess();
				processes.push(process);
				return process as unknown as ChildProcessWithoutNullStreams;
			},
		});
		const active = host.startProcessingCommand("active");
		const queued = host.startProcessingCommand("queued");
		const queuedRejected = assert.rejects(queued.promise, error => isCancellationError(error));

		queued.cancel();
		await queuedRejected;
		assert.equal(processes[0]?.killed, false);
		assert.deepEqual(processes[0]?.commands.map(command => command.command), ["active"]);

		processes[0]?.respond(0, { value: 1 });
		assert.deepEqual(await active.promise, { value: 1 });
		host.stop();
	});

	test("does not let payload fields replace the worker protocol command", async () => {
		const process = new TestRustWorkerProcess();
		const host = new RustWorkerHost({
			isWindows: false,
			processingPoolSize: 1,
			resolveExecutablePath: () => "test-conductor-rs",
			spawnProcessingWorker: () => process as unknown as ChildProcessWithoutNullStreams,
		});

		const request = host.startProcessingCommand("actual", {
			command: "injected",
			id: 999,
		});

		assert.equal(process.commands[0]?.command, "actual");
		assert.notEqual(process.commands[0]?.id, 999);
		process.respond(0, { value: 1 });
		assert.deepEqual(await request.promise, { value: 1 });
		host.stop();
	});

	test("waits for a busy slot before disposing its file state", async () => {
		const process = new TestRustWorkerProcess();
		const host = new RustWorkerHost({
			isWindows: false,
			processingPoolSize: 1,
			resolveExecutablePath: () => "test-conductor-rs",
			spawnProcessingWorker: () => process as unknown as ChildProcessWithoutNullStreams,
		});
		const active = host.startProcessingCommand("active");

		const disposal = host.disposeProcessingFile("file-a");
		assert.deepEqual(process.commands.map(command => command.command), ["active"]);
		process.respond(0, { value: 1 });
		assert.deepEqual(await active.promise, { value: 1 });
		await waitFor(() => process.commands.length === 2);
		assert.deepEqual(process.commands.map(command => command.command), ["active", "dispose"]);
		assert.equal(process.commands[1]?.fileId, "file-a");
		process.respond(1, {});
		await disposal;
		assert.equal(process.killed, false);
		host.stop();
	});

	test("replaces a worker after a stdio stream error", async () => {
		const processes: TestRustWorkerProcess[] = [];
		const host = new RustWorkerHost({
			isWindows: false,
			processingPoolSize: 1,
			resolveExecutablePath: () => "test-conductor-rs",
			spawnProcessingWorker: () => {
				const process = new TestRustWorkerProcess();
				processes.push(process);
				return process as unknown as ChildProcessWithoutNullStreams;
			},
		});
		const first = host.startProcessingCommand("first");
		const firstRejected = assert.rejects(first.promise, /stdout failed/);

		processes[0]?.stdout.emit("error", new Error("stdout failed"));
		await firstRejected;
		const second = host.startProcessingCommand("second");
		await waitFor(() => processes.length === 2 && processes[1]?.commands.length === 1);
		processes[1]?.respond(0, { value: 2 });

		assert.deepEqual(await second.promise, { value: 2 });
		host.stop();
	});
});

function touch(filePath: string): string {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, "");
	return filePath;
}

class TestRustWorkerProcess extends EventEmitter {
	public readonly commands: Array<Record<string, unknown>> = [];
	public killed = false;
	public readonly pid = undefined;
	public readonly stderr = new TestProcessStream();
	public readonly stdout = new TestProcessStream();
	public readonly stdin = {
		write: (
			value: string,
			_encoding: string,
			callback: (error?: Error | null) => void,
		): boolean => {
			this.commands.push(JSON.parse(value.trim()) as Record<string, unknown>);
			callback();
			return true;
		},
	};

	public constructor(private readonly exitOnKill = true) {
		super();
	}

	public kill(): boolean {
		if (this.killed) {
			return false;
		}
		this.killed = true;
		if (this.exitOnKill) {
			this.exit();
		}
		return true;
	}

	public exit(): void {
		this.emit("exit", null, "SIGTERM");
	}

	public respond(index: number, result: unknown): void {
		const command = this.commands[index];
		assert.ok(command);
		this.stdout.emit("data", `${JSON.stringify({
			id: command.id,
			ok: true,
			result,
		})}\n`);
	}
}

class TestProcessStream extends EventEmitter {
	public setEncoding(): this {
		return this;
	}
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 0));
	}
	assert.fail("Timed out waiting for Rust worker host state.");
}
