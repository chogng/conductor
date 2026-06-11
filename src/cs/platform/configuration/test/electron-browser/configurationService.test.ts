import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import {
  ConfigurationTarget,
} from "src/cs/platform/configuration/common/configuration";
import { getUserSettingsResource } from "src/cs/platform/environment/common/environmentService";
import { ElectronBrowserConfigurationService } from "src/cs/platform/configuration/electron-browser/configurationService";
import {
  FileChangeType,
  FileType,
  type IFileChange,
  type IFileContent,
  type IFileService,
  type IFileStat,
  type IReadFileOptions,
  type IWatchOptions,
} from "src/cs/platform/files/common/files";
import type {
  INativeHostService,
  INativeOpenDialogOptions,
  INativeOpenDialogResult,
} from "src/cs/platform/native/common/native";
import type { INativeHostEnvironment } from "src/cs/platform/native/common/nativeHostService";

class MemoryFileService implements IFileService {
  declare readonly _serviceBrand: undefined;

  private readonly files = new Map<string, string>();
  private readonly onDidFilesChangeEmitter = new Emitter<readonly IFileChange[]>();
  public readonly onDidFilesChange = this.onDidFilesChangeEmitter.event;

  public getWrittenContent(resource: URI): string | undefined {
    return this.files.get(URI.revive(resource).toString());
  }

  public setContent(resource: URI, content: string): void {
    this.files.set(URI.revive(resource).toString(), content);
  }

  public registerProvider(): IDisposable {
    return toDisposable(() => undefined);
  }

  public getProvider(): undefined {
    return undefined;
  }

  public async exists(resource: URI): Promise<boolean> {
    return this.files.has(URI.revive(resource).toString());
  }

  public async readDir(): Promise<readonly [string, FileType][]> {
    return [];
  }

  public async readFile(resource: URI, _options?: IReadFileOptions): Promise<IFileContent> {
    return {
      encoding: "utf8",
      value: this.files.get(URI.revive(resource).toString()) ?? "",
    };
  }

  public async writeFile(resource: URI, content: string): Promise<void> {
    this.files.set(URI.revive(resource).toString(), content);
    this.onDidFilesChangeEmitter.fire([{
      resource,
      type: FileChangeType.UPDATED,
    }]);
  }

  public async realpath(resource: URI): Promise<URI> {
    return resource;
  }

  public async stat(resource: URI): Promise<IFileStat> {
    return {
      ctime: 0,
      mtime: 0,
      path: URI.revive(resource).fsPath,
      size: this.files.get(URI.revive(resource).toString())?.length ?? 0,
      type: FileType.File,
    };
  }

  public watch(): IDisposable {
    return toDisposable(() => undefined);
  }
}

class TestNativeHostService implements INativeHostService {
  declare readonly _serviceBrand: undefined;
  public readonly windowId = 1;

  constructor(private readonly userDataPath: string) {}

  public async getEnvironment(): Promise<INativeHostEnvironment> {
    return {
      appVersion: "test",
      isDesktop: true,
      isPackaged: false,
      platform: "win32",
      userDataPath: this.userDataPath,
    };
  }

  public async showOpenDialog(_options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult> {
    return { canceled: true, filePaths: [] };
  }

  public showItemInFolder(): void {}
  public toggleDevTools(): void {}
  public reloadWindow(): void {}
  public async isMaximized(): Promise<boolean> { return false; }
  public maximizeWindow(): void {}
  public unmaximizeWindow(): void {}
  public closeWindow(): void {}
  public minimizeWindow(): void {}
  public updateWindowControls(): void {}
}

suite("platform/configuration/electron-browser/configurationService", () => {
  test("uses userDataPath/User/settings.json as the user settings resource", () => {
    const resource = getUserSettingsResource("C:\\Users\\lanxi\\AppData\\Roaming\\Conductor Studio");

    assert.equal(
      resource.fsPath,
      "C:\\Users\\lanxi\\AppData\\Roaming\\Conductor Studio\\User\\settings.json",
    );
  });

  test("loads and writes user settings at the user data path", async () => {
    const userDataPath = "C:\\Users\\lanxi\\AppData\\Roaming\\Conductor Studio";
    const settingsResource = getUserSettingsResource(userDataPath);
    const files = new MemoryFileService();
    files.setContent(settingsResource, "{ \"editor.tabSize\": 4 }");

    const service = new ElectronBrowserConfigurationService(
      files,
      new TestNativeHostService(userDataPath),
    );
    await service.reloadConfiguration();

    assert.equal(service.getValue("editor.tabSize"), 4);

    await service.updateValue("editor.tabSize", 2, ConfigurationTarget.USER);

    assert.equal(service.getValue("editor.tabSize"), 2);
    assert.equal(
      files.getWrittenContent(settingsResource),
      "{\n  \"editor.tabSize\": 2\n}\n",
    );
    service.dispose();
  });

  test("writes override settings under language keys", async () => {
    const userDataPath = "C:\\Users\\lanxi\\AppData\\Roaming\\Conductor Studio";
    const settingsResource = getUserSettingsResource(userDataPath);
    const files = new MemoryFileService();
    const service = new ElectronBrowserConfigurationService(
      files,
      new TestNativeHostService(userDataPath),
    );
    await service.reloadConfiguration();

    await service.updateValue(
      "editor.tabSize",
      2,
      { overrideIdentifiers: ["json"] },
      ConfigurationTarget.USER,
    );

    assert.equal(
      files.getWrittenContent(settingsResource),
      "{\n  \"[json]\": {\n    \"editor.tabSize\": 2\n  }\n}\n",
    );
    service.dispose();
  });
});
