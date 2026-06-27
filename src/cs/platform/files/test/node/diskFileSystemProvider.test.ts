import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { URI } from "../../../../base/common/uri.ts";
import { FileType } from "../../common/files.ts";
import { DiskFileSystemProvider } from "../../node/diskFileSystemProvider.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/files/test/node/diskFileSystemProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
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
        decodeFileContent(await provider.readFile(URI.file(path.join(root, "transfer%25.csv")))),
        "Vg,Id\n0,1",
      );
      assert.equal(
        decodeFileContent(await provider.readFile(URI.file(path.join(root, "transfer%raw.csv")))),
        "Vg,Id\n1,2",
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("DiskFileSystemProvider returns byte content without decoding percent paths", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "transfer%25.csv");
      fs.writeFileSync(filePath, Buffer.from([0, 1, 2, 3]));

      const provider = new DiskFileSystemProvider();
      const content = await provider.readFile(URI.file(filePath));

      assert.deepEqual([...content.value], [0, 1, 2, 3]);
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
      store.add(provider.onDidFilesChange(events => {
        changes.push(...events.map(event => `${event.resource.fsPath}:${event.type}`));
      }));

      await provider.writeFile(URI.file(filePath), "{\n  \"editor.tabSize\": 2\n}\n");

      assert.equal(fs.readFileSync(filePath, "utf8"), "{\n  \"editor.tabSize\": 2\n}\n");
      assert.deepEqual(changes, [`${filePath}:1`]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("DiskFileSystemProvider deletes files and emits a delete change", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "source.csv");
      fs.writeFileSync(filePath, "Vg,Id\n0,1", "utf8");
      const provider = new DiskFileSystemProvider();
      const changes: string[] = [];
      store.add(provider.onDidFilesChange(events => {
        changes.push(...events.map(event => `${event.resource.fsPath}:${event.type}`));
      }));

      await provider.deleteFile(URI.file(filePath));

      assert.equal(fs.existsSync(filePath), false);
      assert.deepEqual(changes, [`${filePath}:2`]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("DiskFileSystemProvider moves files to trash and emits a delete change", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "source.csv");
      fs.writeFileSync(filePath, "Vg,Id\n0,1", "utf8");
      const trashedPaths: string[] = [];
      const provider = new DiskFileSystemProvider(async trashedPath => {
        trashedPaths.push(trashedPath);
        await fs.promises.rm(trashedPath, { force: true });
      });
      const changes: string[] = [];
      store.add(provider.onDidFilesChange(events => {
        changes.push(...events.map(event => `${event.resource.fsPath}:${event.type}`));
      }));

      await provider.moveFileToTrash(URI.file(filePath));

      assert.deepEqual(trashedPaths, [filePath]);
      assert.equal(fs.existsSync(filePath), false);
      assert.deepEqual(changes, [`${filePath}:2`]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});

const decodeFileContent = (content: { readonly value: Uint8Array }): string =>
  new TextDecoder().decode(content.value);
