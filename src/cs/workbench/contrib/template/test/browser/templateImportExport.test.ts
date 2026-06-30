/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Event, type Event as EventType } from "src/cs/base/common/event";
import { Disposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  type IFileDialogService,
  type ISaveDialogOptions,
} from "src/cs/platform/dialogs/common/dialogs";
import {
  FileSystemProviderCapabilities,
  FileType,
  type IFileChange,
  type IFileContent,
  type IFileService,
  type IFileStat,
  type IFileSystemProviderCapabilitiesChangeEvent,
  type IFileSystemProviderRegistrationEvent,
  type IFileSystemProvider,
  type IReadFileOptions,
} from "src/cs/platform/files/common/files";
import {
  formatTemplateExportFileName,
  importTemplateFile,
  TemplateExportController,
} from "src/cs/workbench/contrib/template/browser/templateImportExport";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";

suite("workbench/contrib/template/browser/templateImportExport", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("formatTemplateExportFileName creates a safe json filename", () => {
    assert.equal(formatTemplateExportFileName("  Transfer: A/B?  "), "Transfer- A-B-.json");
    assert.equal(formatTemplateExportFileName(""), "analysis-template.json");
  });

  test("importTemplateFile reads JSON and passes source filename", async () => {
    const file = new File([JSON.stringify({ name: "demo" })], "template.json", {
      type: "application/json",
    });
    let receivedPayload;
    let receivedOptions;

    await importTemplateFile(file, (payload, options) => {
      receivedPayload = payload;
      receivedOptions = options;
    });

    assert.deepEqual(receivedPayload, { name: "demo" });
    assert.deepEqual(receivedOptions, { fileName: "template.json" });
  });

  test("TemplateExportController writes JSON to selected save path", async () => {
    const target = URI.file("/exports/Transfer.json");
    let saveOptions: ISaveDialogOptions | undefined;
    let writtenResource: URI | undefined;
    let writtenContent: string | undefined;
    const controller = new TemplateExportController(
      createFileDialogService({
        canSaveFile: true,
        onSave: options => {
          saveOptions = options;
          return target;
        },
      }),
      new TestFileService((resource, content) => {
        writtenResource = resource;
        writtenContent = content;
      }),
      createPathService(URI.file("/exports")),
    );

    const result = await controller.exportTemplateToDialog({
      source: "conductor.userTemplate",
      templates: [],
      version: 1,
    }, {
      templateName: "Transfer",
    });

    assert.equal(result.kind, "saved");
    assert.equal(saveOptions?.defaultUri?.path, "/exports/Transfer.json");
    assert.equal(writtenResource?.toString(), target.toString());
    assert.deepEqual(JSON.parse(writtenContent ?? ""), {
      source: "conductor.userTemplate",
      templates: [],
      version: 1,
    });
  });

  test("TemplateExportController downloads JSON when save files are unsupported", async () => {
    const restores = installDownloadHarness();
    const controller = new TemplateExportController(
      createFileDialogService({
        canSaveFile: false,
        onSave: () => {
          throw new Error("showSaveDialog should not be called.");
        },
      }),
      new TestFileService(() => {
        throw new Error("writeFile should not be called.");
      }),
      createPathService(URI.file("/exports")),
    );

    try {
      const result = await controller.exportTemplateToDialog({
        source: "conductor.userTemplate",
        templates: [],
        version: 1,
      }, {
        templateName: "Transfer",
      });

      assert.equal(result.kind, "downloaded");
      const downloaded = restores.downloads[0];
      assert.ok(downloaded);
      assert.equal(downloaded.download, "Transfer.json");
      assert.deepEqual(JSON.parse(await downloaded.blob.text()), {
        source: "conductor.userTemplate",
        templates: [],
        version: 1,
      });
    } finally {
      restores.restore();
    }
  });
});

function createFileDialogService(options: {
  readonly canSaveFile?: boolean;
  readonly onSave: (options: ISaveDialogOptions) => URI | undefined;
}): IFileDialogService {
  return {
    _serviceBrand: undefined,
    canSaveFile: () => options.canSaveFile ?? true,
    showOpenDialog: async () => undefined,
    showSaveDialog: async saveOptions => options.onSave(saveOptions),
  };
}

function installDownloadHarness(): {
  readonly downloads: {
    readonly blob: Blob;
    readonly download: string;
  }[];
  readonly restore: () => void;
} {
  const downloads: { blob: Blob; download: string }[] = [];
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  let lastBlob: Blob | undefined;

  class Anchor {
    public download = "";
    public href = "";
    public readonly style = {
      display: "",
    };

    public click(): void {
      const blob = lastBlob;
      if (!blob) {
        return;
      }

      downloads.push({
        blob,
        download: this.download,
      });
    }

    public remove(): void {
      // Test harness placeholder.
    }
  }

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: {
        append: () => undefined,
      },
      createElement: (tag: string) => {
        assert.equal(tag, "a");
        return new Anchor();
      },
    },
  });
  URL.createObjectURL = ((blob: Blob) => {
    lastBlob = blob;
    return "blob:template-export";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

  return {
    downloads,
    restore: () => {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      } else {
        delete (globalThis as { document?: Document }).document;
      }
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    },
  };
}

function createPathService(userHome: URI): IPathService {
  function resolveUserHome(options: { preferLocal: true }): URI;
  function resolveUserHome(options?: { preferLocal: boolean }): Promise<URI>;
  function resolveUserHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
    return options?.preferLocal ? userHome : Promise.resolve(userHome);
  }

  return {
    _serviceBrand: undefined,
    defaultUriScheme: "file",
    fileURI: async (path: string) => URI.file(path),
    path: Promise.resolve({} as IPathService["path"] extends Promise<infer T> ? T : never),
    resolvedUserHome: userHome,
    userHome: resolveUserHome,
  };
}

class TestFileService implements IFileService {
  public readonly _serviceBrand = undefined;
  public readonly onDidFilesChange = Event.None as EventType<readonly IFileChange[]>;
  public readonly onDidChangeFileSystemProviderCapabilities =
    Event.None as EventType<IFileSystemProviderCapabilitiesChangeEvent>;
  public readonly onDidChangeFileSystemProviderRegistrations =
    Event.None as EventType<IFileSystemProviderRegistrationEvent>;

  public constructor(
    private readonly onWriteFile: (resource: URI, content: string) => void,
  ) {}

  public registerProvider(_scheme: string, _provider: IFileSystemProvider): IDisposable {
    return Disposable.None;
  }

  public getProvider(_scheme: string): IFileSystemProvider | undefined {
    return undefined;
  }

  public getProviderCapabilities(_resourceOrScheme: URI | string): FileSystemProviderCapabilities {
    return FileSystemProviderCapabilities.FileRead | FileSystemProviderCapabilities.FileWrite;
  }

  public hasProvider(resource: URI): boolean {
    return URI.revive(resource).scheme === "file";
  }

  public hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean {
    return Boolean(this.hasProvider(resource) && (this.getProviderCapabilities(resource) & capability));
  }

  public *listCapabilities(): Iterable<{ readonly capabilities: FileSystemProviderCapabilities; readonly scheme: string }> {
    yield {
      capabilities: this.getProviderCapabilities("file"),
      scheme: "file",
    };
  }

  public exists(_resource: URI): Promise<boolean> {
    return Promise.resolve(false);
  }

  public readDir(_resource: URI): Promise<readonly [string, FileType][]> {
    throw new Error("Not implemented.");
  }

  public readFile(_resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
    throw new Error("Not implemented.");
  }

  public writeFile(resource: URI, content: string): Promise<void> {
    this.onWriteFile(resource, content);
    return Promise.resolve();
  }

  public deleteFile(_resource: URI): Promise<void> {
    throw new Error("Not implemented.");
  }

  public moveFileToTrash(_resource: URI): Promise<void> {
    throw new Error("Not implemented.");
  }

  public realpath(resource: URI): Promise<URI> {
    return Promise.resolve(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return Promise.resolve({
      ctime: 0,
      mtime: 0,
      path: resource.fsPath,
      size: 0,
      type: FileType.File,
    });
  }

  public watch(_resource: URI): IDisposable {
    return Disposable.None;
  }
}
