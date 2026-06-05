import assert from "node:assert/strict";
import test from "node:test";

import { HTMLFileSystemProvider } from "../../../../../platform/files/browser/htmlFileSystemProvider.ts";
import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from "../../../../../platform/files/browser/webFileSystemAccess.ts";
import { FileService } from "../../../../../platform/files/common/fileService.ts";
import { collectFolderImportFiles } from "../../browser/fileImportExport.ts";

function createFileHandle(name: string, text: string): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    getFile: async () => new File([text], name, {
      lastModified: 1,
      type: "text/csv;charset=utf-8",
    }),
  };
}

function createDirectoryHandle({
  children,
  name,
  useValuesOnly = false,
}: {
  readonly children: readonly FileSystemHandle[];
  readonly name: string;
  readonly useValuesOnly?: boolean;
}): FileSystemDirectoryHandle {
  const getChild = (childName: string): FileSystemHandle | undefined =>
    children.find(child => child.name === childName);
  const handle: FileSystemDirectoryHandle = {
    kind: "directory",
    name,
    entries: useValuesOnly
      ? undefined
      : async function* entries() {
        for (const child of children) {
          yield [child.name, child];
        }
      },
    values: useValuesOnly
      ? async function* values() {
        for (const child of children) {
          yield child;
        }
      }
      : undefined,
    getDirectoryHandle: async (childName: string) => {
      const child = getChild(childName);
      if (child?.kind === "directory") {
        return child;
      }

      throw new Error(`Directory '${childName}' was not found.`);
    },
    getFileHandle: async (childName: string) => {
      const child = getChild(childName);
      if (child?.kind === "file") {
        return child;
      }

      throw new Error(`File '${childName}' was not found.`);
    },
  };

  if (!useValuesOnly) {
    handle[Symbol.asyncIterator] = handle.entries;
  }

  return handle;
}

function createUnreadableDirectoryHandle(name: string, message: string): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    entries: async function* entries() {
      throw new Error(message);
    },
    values: undefined,
    getDirectoryHandle: async () => {
      throw new Error(message);
    },
    getFileHandle: async () => {
      throw new Error(message);
    },
  };
}

async function collectBrowserFolderFiles(root: FileSystemDirectoryHandle) {
  const provider = new HTMLFileSystemProvider();
  const filesService = new FileService();
  filesService.registerProvider("file", provider);
  const folder = await provider.registerDirectoryHandle(root);

  return collectFolderImportFiles(folder, filesService);
}

test("collectFolderImportFiles reads browser directory handles that only expose values", async () => {
  const root = createDirectoryHandle({
    children: [
      createFileHandle("transfer.csv", "Vg,Id\n0,1"),
    ],
    name: "selected-folder",
    useValuesOnly: true,
  });

  const result = await collectBrowserFolderFiles(root);

  assert.equal(result.readFailures.length, 0);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].relativePath, "selected-folder/transfer.csv");
  assert.equal(await (await result.files[0].loadFile()).text(), "Vg,Id\n0,1");
});

test("collectFolderImportFiles keeps raw percent signs in browser file names", async () => {
  const root = createDirectoryHandle({
    children: [
      createFileHandle("transfer%25.csv", "Vg,Id\n0,1"),
      createFileHandle("transfer%raw.csv", "Vg,Id\n1,2"),
    ],
    name: "selected-folder",
  });

  const result = await collectBrowserFolderFiles(root);

  assert.equal(result.readFailures.length, 0);
  assert.deepEqual(
    result.files.map(file => file.relativePath),
    [
      "selected-folder/transfer%25.csv",
      "selected-folder/transfer%raw.csv",
    ],
  );
  assert.equal(await (await result.files[0].loadFile()).text(), "Vg,Id\n0,1");
  assert.equal(await (await result.files[1].loadFile()).text(), "Vg,Id\n1,2");
});

test("collectFolderImportFiles keeps readable files when a child folder cannot be read", async () => {
  const root = createDirectoryHandle({
    children: [
      createFileHandle("transfer.csv", "Vg,Id\n0,1"),
      createUnreadableDirectoryHandle("blocked", "Permission denied"),
    ],
    name: "selected-folder",
  });

  const result = await collectBrowserFolderFiles(root);

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].relativePath, "selected-folder/transfer.csv");
  assert.equal(result.readFailures.length, 1);
  assert.equal(result.readFailures[0].fileName, "blocked");
  assert.equal(result.readFailures[0].relativePath, "selected-folder/blocked");
  assert.equal(result.readFailures[0].message, "Permission denied");
});
