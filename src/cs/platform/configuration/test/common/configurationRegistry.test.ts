import assert from "assert";

import {
  ConfigurationScope,
  Extensions,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";

suite("platform/configuration/common/configurationRegistry", () => {
  test("registers configuration properties", () => {
    const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
    const changed: string[][] = [];
    const schemaChanges: number[] = [];

    const configuration = {
      id: "testConfiguration",
      title: "Test",
      type: "object",
      properties: {
        "test.enabled": {
          type: "boolean" as const,
          default: true,
          scope: ConfigurationScope.APPLICATION,
        },
      },
    };

    const disposable = registry.onDidUpdateConfiguration(keys => {
      changed.push(Array.from(keys));
    });
    const schemaDisposable = registry.onDidSchemaChange(() => {
      schemaChanges.push(1);
    });

    registry.registerConfiguration(configuration);

    const properties = registry.getConfigurationProperties();
    assert.equal(properties["test.enabled"].default, true);
    assert.equal(properties["test.enabled"].scope, ConfigurationScope.APPLICATION);
    assert.deepEqual(changed, [["test.enabled"]]);
    assert.equal(schemaChanges.length, 1);

    registry.deregisterConfigurations([configuration]);
    disposable.dispose();
    schemaDisposable.dispose();
  });

  test("does not expose excluded properties", () => {
    const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
    const configuration = {
      id: "testExcludedConfiguration",
      properties: {
        "test.excluded": {
          type: "boolean" as const,
          default: true,
          included: false,
        },
      },
    };

    registry.registerConfiguration(configuration);

    assert.equal(registry.getConfigurationProperties()["test.excluded"], undefined);

    registry.deregisterConfigurations([configuration]);
  });
});
