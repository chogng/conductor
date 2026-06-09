import { URI } from "src/cs/base/common/uri";
import {
  ConfigurationTarget,
  IConfigurationService,
  type IConfigurationOverrides,
  type IConfigurationValue,
} from "src/cs/platform/configuration/common/configuration";
import { getUserSettingsResource } from "src/cs/platform/environment/common/environmentService";
import {
  Configuration,
  ConfigurationModel,
  parseConfigurationModel,
} from "src/cs/platform/configuration/common/configurationModels";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { IFileService, type IFileService as IFileServiceType } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { INativeHostService, type INativeHostService as INativeHostServiceType } from "src/cs/platform/native/common/native";

export class ElectronBrowserConfigurationService extends ConfigurationService {
  private readonly userSettingsResource: Promise<URI>;

  constructor(
    @IFileService private readonly fileService: IFileServiceType,
    @INativeHostService private readonly nativeHostService: INativeHostServiceType,
  ) {
    super();

    this.userSettingsResource = this.resolveUserSettingsResource();
    void this.reloadConfiguration().catch(error => {
      console.error("Failed to load user settings.", error);
    });
  }

  public override async reloadConfiguration(): Promise<void> {
    await super.reloadConfiguration();

    const previous = Configuration.parse(this.configuration.toData());
    const model = await this.readUserConfiguration();
    const change = this.updateModelForTarget(ConfigurationTarget.USER_LOCAL, model);

    if (change.keys.length || change.overrides.length) {
      this.fireDidChangeConfiguration(change, previous, ConfigurationTarget.USER);
    }
  }

  public override inspect<T>(
    key: string,
    overrides: IConfigurationOverrides = {},
  ): IConfigurationValue<Readonly<T>> {
    return super.inspect<T>(key, overrides);
  }

  protected override async writeConfigurationForTarget(
    target: ConfigurationTarget,
    model: ConfigurationModel,
  ): Promise<void> {
    if (target !== ConfigurationTarget.USER && target !== ConfigurationTarget.USER_LOCAL) {
      return;
    }

    const resource = await this.userSettingsResource;
    await this.fileService.writeFile(
      resource,
      `${JSON.stringify(model.toRaw(), null, 2)}\n`,
    );
  }

  private async resolveUserSettingsResource(): Promise<URI> {
    const environment = await this.nativeHostService.getEnvironment();
    return getUserSettingsResource(environment.userDataPath ?? "");
  }

  private async readUserConfiguration(): Promise<ConfigurationModel> {
    const resource = await this.userSettingsResource;

    if (!await this.fileService.exists(resource)) {
      return ConfigurationModel.createEmptyModel();
    }

    const content = await this.fileService.readFile(resource, { encoding: "utf8" });
    const raw = JSON.parse(content.value || "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`User settings must be a JSON object: ${resource.toString()}`);
    }

    return parseConfigurationModel(raw as Record<string, unknown>);
  }
}

registerSingleton(
  IConfigurationService,
  ElectronBrowserConfigurationService,
  InstantiationType.Delayed,
);
