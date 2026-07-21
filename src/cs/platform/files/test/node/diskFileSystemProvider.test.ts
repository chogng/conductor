import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { URI } from "../../../../base/common/uri.ts";
import {
  FileChangeType,
  FileSystemProviderCapabilities,
  FileType,
  type IFileChange,
} from "../../common/files.ts";
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

  test("DiskFileSystemProvider reports an available file as write-unlocked", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "workbook.xls");
      fs.writeFileSync(filePath, "workbook", "utf8");
      const provider = new DiskFileSystemProvider();

      assert.equal(await provider.getWriteLockState(URI.file(filePath)), "unlocked");
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

  test("DiskFileSystemProvider exposes local file capabilities", () => {
    const provider = new DiskFileSystemProvider(async () => undefined);

    assert.equal(Boolean(provider.capabilities & FileSystemProviderCapabilities.FileRead), true);
    assert.equal(Boolean(provider.capabilities & FileSystemProviderCapabilities.FileReadRange), true);
    assert.equal(Boolean(provider.capabilities & FileSystemProviderCapabilities.FileAtomicWrite), true);
    assert.equal(Boolean(provider.capabilities & FileSystemProviderCapabilities.FileWatch), true);
    assert.equal(Boolean(provider.capabilities & FileSystemProviderCapabilities.FileTrash), true);
  });

  test("DiskFileSystemProvider supports atomic writes", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "User", "settings.json");
      const provider = new DiskFileSystemProvider();

      await provider.writeFile(URI.file(filePath), "{\"theme\":\"dark\"}\n", { atomic: true });

      assert.equal(fs.readFileSync(filePath, "utf8"), "{\"theme\":\"dark\"}\n");
      assert.deepEqual(
        fs.readdirSync(path.dirname(filePath)).filter(name => name.endsWith(".tmp")),
        [],
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("DiskFileSystemProvider watches parent folder for a file that does not exist yet", async () => {
    const root = createTempDir();
    try {
      const filePath = path.join(root, "late.csv");
      const provider = new DiskFileSystemProvider();
      const change = waitForFileChange(provider, filePath);
      store.add(provider.watch("late-file", URI.file(filePath), { recursive: false }));

      await fs.promises.writeFile(filePath, "Vg,Id\n0,1", "utf8");

      const event = await change;
      assert.equal(event.resource.fsPath, filePath);
      assert.equal(
        event.type === FileChangeType.ADDED || event.type === FileChangeType.UPDATED,
        true,
      );
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

const waitForFileChange = (
  provider: DiskFileSystemProvider,
  filePath: string,
): Promise<IFileChange> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      reject(new Error(`Timed out waiting for file change: ${filePath}`));
    }, 2000);
    const disposable = provider.onDidFilesChange(changes => {
      const change = changes.find(candidate => candidate.resource.fsPath === filePath);
      if (!change) {
        return;
      }

      clearTimeout(timeout);
      disposable.dispose();
      resolve(change);
    });
  });
