import {
  IConfigurationService,
} from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";

registerSingleton(IConfigurationService, ConfigurationService, InstantiationType.Delayed);
