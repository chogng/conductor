import assert from "assert";

import {
  CONDUCTOR_CONFIGURATION_KEYS,
  ConfigurationScope,
  Extensions,
  normalizeConductorSettings,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";

suite("platform/configuration/common/configurationRegistry", () => {
  test("registers Conductor configuration defaults", () => {
    const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
    const properties = registry.getConfigurationProperties();

    assert.equal(properties["theme"].default, "system");
    assert.equal(properties["filesExplorerDensity"].default, "compact");
    assert.deepEqual(properties["filesExplorerDensity"].enum, ["compact", "default", "comfortable"]);
    assert.equal(properties["filesExplorerShowBadges"].default, true);
    assert.equal(properties["filesExplorerShowBadges"].type, "boolean");
    assert.equal(properties["fileNameFieldSeparators"].default, "_- .()[]{}");
    assert.equal(properties["plotAxisSettings"].type, "object");
    assert.equal(CONDUCTOR_CONFIGURATION_KEYS.includes("originRuntimeCleanupEnabled"), true);
  });

  test("normalizes Explorer density", () => {
    assert.equal(normalizeConductorSettings({ filesExplorerDensity: "comfortable" }).filesExplorerDensity, "comfortable");
    assert.equal(normalizeConductorSettings({ filesExplorerDensity: "loose" }).filesExplorerDensity, "compact");
  });

  test("normalizes Explorer badge visibility", () => {
    assert.equal(normalizeConductorSettings({ filesExplorerShowBadges: false }).filesExplorerShowBadges, false);
    assert.equal(normalizeConductorSettings({ filesExplorerShowBadges: "false" }).filesExplorerShowBadges, true);
  });

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
