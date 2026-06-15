/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	resolveRustProcessingPoolSize,
	resolveRustWorkerExecutablePath,
} from "src/cs/platform/rust/electron-main/rustWorkerHost";

suite("platform/rust/electron-main/rustWorkerHost", () => {
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
			resourcesPath: path.join(root, "desktop-dist"),
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
			resourcesPath: path.join(root, "desktop-dist"),
		}), buildCachePath);
	});

	test("resolves adaptive processing pool size from available parallelism", () => {
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: Number.NaN }), 2);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 2 }), 2);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8 }), 4);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 16 }), 8);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 64 }), 8);
	});

	test("resolves processing pool size from bounded environment override", () => {
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "1" }), 1);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "6" }), 6);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "64" }), 16);
		assert.equal(resolveRustProcessingPoolSize({ availableParallelism: 8, envValue: "invalid" }), 4);
	});
});

function touch(filePath: string): string {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, "");
	return filePath;
}
