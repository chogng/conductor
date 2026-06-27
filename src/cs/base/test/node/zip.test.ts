import assert from "assert";
import { promises as fsPromises } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CancellationToken } from "../../common/async.ts";
import { buffer, extract, zip } from "../../node/zip.ts";

suite("base/test/node/zip", () => {
	let tempRoot: string | undefined;

	setup(async () => {
		tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "conductor-zip-"));
	});

	teardown(async () => {
		if (tempRoot) {
			await fsPromises.rm(tempRoot, { recursive: true, force: true });
			tempRoot = undefined;
		}
	});

	test("zips buffers, local files, and reads entries", async () => {
		const root = assertRoot(tempRoot);
		const localPath = path.join(root, "local.txt");
		const zipPath = path.join(root, "sample.zip");

		await fsPromises.writeFile(localPath, "from disk", "utf8");
		await zip(zipPath, [
			{ path: "folder/inline.txt", contents: "inline" },
			{ path: "folder/local.txt", localPath },
		]);

		assert.equal((await buffer(zipPath, "folder/inline.txt")).toString("utf8"), "inline");
		assert.equal((await buffer(zipPath, "folder/local.txt")).toString("utf8"), "from disk");
	});

	test("extracts only the requested source path", async () => {
		const root = assertRoot(tempRoot);
		const zipPath = path.join(root, "sample.zip");
		const targetPath = path.join(root, "target");

		await zip(zipPath, [
			{ path: "source/keep.txt", contents: "keep" },
			{ path: "other/skip.txt", contents: "skip" },
		]);

		await extract(zipPath, targetPath, { sourcePath: "source" }, CancellationToken.None);

		assert.equal(await fsPromises.readFile(path.join(targetPath, "keep.txt"), "utf8"), "keep");
		await assert.rejects(fsPromises.stat(path.join(targetPath, "other", "skip.txt")));
	});
});

function assertRoot(value: string | undefined): string {
	assert.ok(value);
	return value;
}
