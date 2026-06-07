import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { URI } from "../../../../base/common/uri.ts";
import { FileType } from "../../common/files.ts";
import { DiskFileSystemProvider } from "../../node/diskFileSystemProvider.ts";

suite("platform/files/test/node/diskFileSystemProvider", () => {
  function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "conductor-files-"));
  }

  test("DiskFileSystemProvider reads files with raw percent signs in their names", async () => {
    const root = createTempDir();
    try {
      fs.writeFileSync(path.join(root, "transfer%25.csv"), "Vg,Id\n0,1", "utf8");
      fs.writeFileSync(path.join(root, "transfer%raw.csv"), "Vg,Id\n1,2", "utf8");

      const provider = new DiskFileSystemProvider();
      const entries = await provider.readDir(URI.file(root));
      const names = entries.map(([name]) => name).sort();

      assert.deepEqual(names, ["transfer%25.csv", "transfer%raw.csv"]);
      for (const fileName of names) {
        const resource = URI.file(path.join(root, fileName));
        assert.equal((await provider.stat(resource)).type, FileType.File);
      }
      assert.equal(
        (await provider.readFile(URI.file(path.join(root, "transfer%25.csv")))).value,
        "Vg,Id\n0,1",
      );
      assert.equal(
        (await provider.readFile(URI.file(path.join(root, "transfer%raw.csv")))).value,
        "Vg,Id\n1,2",
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("DiskFileSystemProvider returns base64 content without decoding percent paths", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "transfer%25.csv");
      fs.writeFileSync(filePath, Buffer.from([0, 1, 2, 3]));

      const provider = new DiskFileSystemProvider();
      const content = await provider.readFile(URI.file(filePath), { encoding: "base64" });

      assert.equal(content.encoding, "base64");
      assert.equal(content.value, Buffer.from([0, 1, 2, 3]).toString("base64"));
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("DiskFileSystemProvider writes files and creates parent folders", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "User", "settings.json");
      const provider = new DiskFileSystemProvider();
      const changes: string[] = [];
      provider.onDidFilesChange(events => {
        changes.push(...events.map(event => `${event.resource.fsPath}:${event.type}`));
      });

      await provider.writeFile(URI.file(filePath), "{\n  \"editor.tabSize\": 2\n}\n");

      assert.equal(fs.readFileSync(filePath, "utf8"), "{\n  \"editor.tabSize\": 2\n}\n");
      assert.deepEqual(changes, [`${filePath}:1`]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
