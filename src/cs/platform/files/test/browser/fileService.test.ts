import assert from "node:assert/strict";
import test from "node:test";

import { HTMLFileSystemProvider } from "../../browser/htmlFileSystemProvider.ts";
import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from "../../browser/webFileSystemAccess.ts";
import { FileService } from "../../common/fileService.ts";
import { FileType } from "../../common/files.ts";

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

function createBrowserFileService(): {
  readonly filesService: FileService;
  readonly provider: HTMLFileSystemProvider;
} {
  const filesService = new FileService();
  const provider = new HTMLFileSystemProvider();
  filesService.registerProvider("file", provider);

  return { filesService, provider };
}

test("FileService reads browser directory handles that only expose values", async () => {
  const { filesService, provider } = createBrowserFileService();
  const root = createDirectoryHandle({
    children: [
      createFileHandle("transfer.csv", "Vg,Id\n0,1"),
    ],
    name: "selected-folder",
    useValuesOnly: true,
  });

  const folder = await provider.registerDirectoryHandle(root);
  const entries = await filesService.readDir(folder);

  assert.deepEqual(entries, [["transfer.csv", FileType.File]]);
});

test("FileService keeps raw percent signs in browser file paths", async () => {
  const { filesService, provider } = createBrowserFileService();
  const root = createDirectoryHandle({
    children: [
      createFileHandle("transfer%25.csv", "Vg,Id\n0,1"),
      createFileHandle("transfer%raw.csv", "Vg,Id\n1,2"),
    ],
    name: "selected-folder",
  });

  const folder = await provider.registerDirectoryHandle(root);
  const encodedPercent = folder.with({ path: `${folder.path}/transfer%25.csv` });
  const rawPercent = folder.with({ path: `${folder.path}/transfer%raw.csv` });

  assert.equal((await filesService.stat(encodedPercent)).type, FileType.File);
  assert.equal((await filesService.readFile(encodedPercent)).value, "Vg,Id\n0,1");
  assert.equal((await filesService.stat(rawPercent)).type, FileType.File);
  assert.equal((await filesService.readFile(rawPercent)).value, "Vg,Id\n1,2");
});
