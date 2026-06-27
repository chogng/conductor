import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { URI } from "src/cs/base/common/uri";
import {
  ConfigurationTarget,
  type IConfigurationChangeEvent,
} from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { FileService } from "src/cs/platform/files/common/fileService";
import {
  FileSystemProviderCapabilities,
  type FileType,
  type IFileContent,
  type IFileStat,
  type IFileSystemProvider,
  type IReadFileOptions,
  type IWatchOptions,
} from "src/cs/platform/files/common/files";
import { DiskFileSystemProvider } from "src/cs/platform/files/node/diskFileSystemProvider";
import type { DisposableStore, IDisposable } from "src/cs/base/common/lifecycle";
import {
  Extensions,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestFileSystemProvider implements IFileSystemProvider {
  public readonly capabilities: FileSystemProviderCapabilities;
  public readonly onDidFilesChange;

  public constructor(private readonly provider: DiskFileSystemProvider) {
    this.capabilities = provider.capabilities;
    this.onDidFilesChange = provider.onDidFilesChange;
  }

  public exists(resource: URI): Promise<boolean> {
    return this.provider.exists(resource);
  }

  public readDir(resource: URI): Promise<readonly [string, FileType][]> {
    return this.provider.readDir(resource);
  }

  public readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent> {
    return this.provider.readFile(resource, options);
  }

  public writeFile(resource: URI, content: string): Promise<void> {
    return this.provider.writeFile(resource, content);
  }

  public deleteFile(resource: URI): Promise<void> {
    return this.provider.deleteFile(resource);
  }

  public realpath(resource: URI): Promise<URI> {
    return this.provider.realpath(resource);
  }

  public stat(resource: URI): Promise<IFileStat> {
    return this.provider.stat(resource);
  }

  public watch(resource: URI, options: IWatchOptions = {}): IDisposable {
    return this.provider.watch(resource.toString(), resource, options);
  }
}

function createFileBackedConfigurationService(userDataPath: string, store: Pick<DisposableStore, "add">): {
  readonly service: ConfigurationService;
  readonly settingsPath: string;
} {
  const settingsPath = path.join(userDataPath, "User", "settings.json");
  const fileService = store.add(new FileService());
  store.add(fileService.registerProvider("file", new TestFileSystemProvider(new DiskFileSystemProvider())));
  return {
    service: new ConfigurationService(URI.file(settingsPath), fileService),
    settingsPath,
  };
}

suite("platform/configuration/common/configurationService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("reads Conductor defaults from the configuration registry", () => {
    const service = new ConfigurationService();

    assert.equal(service.getValue("theme"), "system");
    assert.equal(service.getValue("originRuntimeKeepSuccessJobs"), 1);
    assert.deepEqual(service.getValue("plotAxisSettings"), {
      xMin: "",
      xMax: "",
      xTicks: "auto",
      xTickCount: 6,
      xStep: "",
      xTooltipDigits: "",
      yMin: "",
      yMax: "",
      yScale: "linear",
      yLogCurrentMode: "all",
      yTicks: "nice",
      yTickCount: 6,
      yStep: "",
      yDecadeStep: 1,
      showGrid: true,
      showMajorTicks: true,
      showMinorTicks: true,
      minorTickCount: "",
      tickLabelFontSize: "",
      axisTitleFontSize: "",
      originTickLabelOffset: "",
      originAxisTitleGap: "",
    });

    service.dispose();
  });

  test("reads defaults from configuration registry", () => {
    const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
    const configuration = {
      id: "serviceDefaults",
      properties: {
        "service.defaultValue": {
          type: "number" as const,
          default: 12,
        },
      },
    };

    registry.registerConfiguration(configuration);
    const service = new ConfigurationService();

    assert.equal(service.getValue("service.defaultValue"), 12);
    assert.equal(service.inspect("service.defaultValue").defaultValue, 12);

    service.dispose();
    registry.deregisterConfigurations([configuration]);
  });

  test("updates user values and emits change events", async () => {
    const service = new ConfigurationService();
    const events: IConfigurationChangeEvent[] = [];
    const disposable = service.onDidChangeConfiguration(event => {
      events.push(event);
    });

    await service.updateValue("service.userValue", "configured", ConfigurationTarget.USER);

    assert.equal(service.getValue("service.userValue"), "configured");
    assert.equal(service.inspect("service.userValue").userLocalValue, "configured");
    assert.equal(events.length, 1);
    assert.equal(events[0].affectsConfiguration("service"), true);

    disposable.dispose();
    service.dispose();
  });

  test("updates override values", async () => {
    const service = new ConfigurationService();

    await service.updateValue(
      "editor.tabSize",
      2,
      { overrideIdentifiers: ["json"] },
      ConfigurationTarget.USER,
    );

    assert.equal(
      service.getValue("editor.tabSize", { overrideIdentifier: "json" }),
      2,
    );
    assert.deepEqual(service.inspect("editor.tabSize").overrideIdentifiers, ["json"]);

    service.dispose();
  });

  test("file backed service reads defaults when user settings do not exist", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const { service, settingsPath } = createFileBackedConfigurationService(userDataPath, store);

    await service.initialize();

    assert.equal(service.getValue("language"), "system");
    assert.equal(service.getValue("theme"), "system");
    assert.equal(fs.existsSync(settingsPath), false);

    service.dispose();
  });

  test("file backed service writes user settings", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const { service, settingsPath } = createFileBackedConfigurationService(userDataPath, store);
    await service.initialize();

    await service.updateValue("theme", "dark", ConfigurationTarget.USER);
    await service.updateValue("originExePath", "C:\\Origin\\Origin.exe", ConfigurationTarget.USER);
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;

    assert.equal(service.getValue("theme"), "dark");
    assert.equal(service.getValue("originExePath"), "C:\\Origin\\Origin.exe");
    assert.equal(raw.theme, "dark");
    assert.equal(raw.originExePath, "C:\\Origin\\Origin.exe");

    service.dispose();
  });

  test("file backed service reads JSONC user settings", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const { service, settingsPath } = createFileBackedConfigurationService(userDataPath, store);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      "{\n  // User preference\n  \"theme\": \"dark\",\n  \"editor\": { \"tabSize\": 2, },\n}\n",
      "utf8",
    );

    await service.initialize();

    assert.equal(service.getValue("theme"), "dark");
    assert.equal(service.getValue("editor.tabSize"), 2);

    service.dispose();
  });

  test("file backed service falls back to defaults for unreadable user settings", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const { service, settingsPath } = createFileBackedConfigurationService(userDataPath, store);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, "{", "utf8");

    await service.initialize();

    assert.equal(service.getValue("theme"), "system");

    service.dispose();
  });
});
