import assert from "assert";

import { HTMLFileSystemProvider } from "../../browser/htmlFileSystemProvider.ts";
import type {
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemHandle,
} from "../../browser/webFileSystemAccess.ts";
import { FileService } from "../../common/fileService.ts";
import { FileType } from "../../common/files.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/files/test/browser/fileService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
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

  function createWritableFileHandle(name: string): {
    readonly getText: () => string;
    readonly handle: FileSystemFileHandle;
  } {
    let text = "";
    return {
      getText: () => text,
      handle: {
        kind: "file",
        name,
        createWritable: async () => ({
          abort: async () => undefined,
          close: async () => undefined,
          write: async data => {
            if (typeof data !== "string") {
              throw new Error("Expected string write content.");
            }

            text = data;
          },
        }),
        getFile: async () => new File([text], name, {
          lastModified: 1,
          type: "application/json;charset=utf-8",
        }),
      },
    };
  }

  function createDirectoryFile(path: string, text: string): File {
    const name = path.split("/").pop() || "file";
    const file = new File([text], name, {
      lastModified: 1,
      type: "text/csv;charset=utf-8",
    });
    Object.defineProperty(file, "webkitRelativePath", {
      value: path,
    });

    return file;
  }

  function createDirectoryHandle({
    children,
    name,
    requiresPermission = false,
    useValuesOnly = false,
  }: {
    readonly children: readonly FileSystemHandle[];
    readonly name: string;
    readonly requiresPermission?: boolean;
    readonly useValuesOnly?: boolean;
  }): FileSystemDirectoryHandle {
    let permission: PermissionState = requiresPermission ? "prompt" : "granted";
    const assertPermission = () => {
      if (permission !== "granted") {
        throw new Error("Permission denied.");
      }
    };
    const getChild = (childName: string): FileSystemHandle | undefined =>
      children.find(child => child.name === childName);
    const handle: FileSystemDirectoryHandle = {
      kind: "directory",
      name,
      queryPermission: async () => permission,
      requestPermission: async () => {
        permission = "granted";
        return permission;
      },
      entries: useValuesOnly
        ? undefined
        : async function* entries() {
          assertPermission();
          for (const child of children) {
            yield [child.name, child];
          }
        },
      values: useValuesOnly
        ? async function* values() {
          assertPermission();
          for (const child of children) {
            yield child;
          }
        }
        : undefined,
      getDirectoryHandle: async (childName: string) => {
        assertPermission();
        const child = getChild(childName);
        if (child?.kind === "directory") {
          return child;
        }

        throw new Error(`Directory '${childName}' was not found.`);
      },
      getFileHandle: async (childName: string) => {
        assertPermission();
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
    const filesService = store.add(new FileService());
    const provider = store.add(new HTMLFileSystemProvider());
    store.add(filesService.registerProvider("file", provider));

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

  test("HTMLFileSystemProvider releases directly registered browser files", async () => {
    const { filesService, provider } = createBrowserFileService();
    const registration = provider.registerFile(new File(
      ["Vg,Id\n0,1"],
      "transfer.csv",
      { lastModified: 1, type: "text/csv" },
    ));
    const resource = registration.resource;

    assert.equal(await filesService.exists(resource), true);
    registration.dispose();
    assert.equal(await filesService.exists(resource), false);
    registration.dispose();
  });

  test("FileService requests permission before reading browser directory handles", async () => {
    const { filesService, provider } = createBrowserFileService();
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer.csv", "Vg,Id\n0,1"),
      ],
      name: "selected-folder",
      requiresPermission: true,
    });

    const folder = await provider.registerDirectoryHandle(root);
    const entries = await filesService.readDir(folder);

    assert.deepEqual(entries, [["transfer.csv", FileType.File]]);
  });

  test("FileService normalizes browser directory root paths when registering handles", async () => {
    const { filesService, provider } = createBrowserFileService();
    const root = createDirectoryHandle({
      children: [
        createFileHandle("transfer.csv", "Vg,Id\n0,1"),
      ],
      name: "selected-folder/",
    });

    const folder = await provider.registerDirectoryHandle(root);

    assert.equal(folder.path, "/selected-folder");
    assert.deepEqual(await filesService.readDir(folder), [["transfer.csv", FileType.File]]);
  });

  test("FileService normalizes browser directory resource paths before lookup", async () => {
    const { filesService, provider } = createBrowserFileService();
    const nested = createDirectoryHandle({
      children: [
        createFileHandle("output.csv", "Vd,Id\n0,3"),
      ],
      name: "nested",
    });
    const root = createDirectoryHandle({
      children: [
        nested,
      ],
      name: "selected-folder",
    });

    const folder = await provider.registerDirectoryHandle(root);
    const output = folder.with({ path: `${folder.path}//nested/../nested/./output.csv` });

    assert.equal(decodeFileContent(await filesService.readFile(output)), "Vd,Id\n0,3");
  });

  test("FileService reads browser directory input files as a virtual folder", async () => {
    const { filesService, provider } = createBrowserFileService();
    const folder = await provider.registerDirectoryInputFiles([
      createDirectoryFile("selected-folder/transfer.csv", "Vg,Id\n0,1"),
      createDirectoryFile("selected-folder/nested/output.csv", "Vg,Id\n1,2"),
    ]);

    assert.deepEqual(await filesService.readDir(folder), [
      ["transfer.csv", FileType.File],
      ["nested", FileType.Directory],
    ]);
    assert.deepEqual(await filesService.readDir(folder.with({ path: `${folder.path}/nested` })), [
      ["output.csv", FileType.File],
    ]);
    assert.equal(
      decodeFileContent(await filesService.readFile(folder.with({ path: `${folder.path}/nested/output.csv` }))),
      "Vg,Id\n1,2",
    );
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
    assert.equal(decodeFileContent(await filesService.readFile(encodedPercent)), "Vg,Id\n0,1");
    assert.equal((await filesService.stat(rawPercent)).type, FileType.File);
    assert.equal(decodeFileContent(await filesService.readFile(rawPercent)), "Vg,Id\n1,2");
  });

  test("FileService writes browser writable file handles", async () => {
    const { filesService, provider } = createBrowserFileService();
    const writable = createWritableFileHandle("template.json");
    const resource = provider.registerWritableFileHandle(writable.handle);

    await filesService.writeFile(resource, "{\"source\":\"conductor.userTemplate\"}\n");

    assert.equal(writable.getText(), "{\"source\":\"conductor.userTemplate\"}\n");
    assert.equal(
      decodeFileContent(await filesService.readFile(resource)),
      "{\"source\":\"conductor.userTemplate\"}\n",
    );
  });
});

const decodeFileContent = (content: { readonly value: Uint8Array }): string =>
  new TextDecoder().decode(content.value);
