import assert from "assert";

import {
  CONDUCTOR_CONFIGURATION_KEYS,
  ConfigurationScope,
  Extensions,
  normalizeConductorSettings,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/configuration/common/configurationRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("registers Conductor configuration defaults", () => {
    const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
    const properties = registry.getConfigurationProperties();

    assert.equal(properties["theme"].default, "system");
    assert.deepEqual(properties["filesExplorerBadgeColors"].default, {
      cf: "cyan",
      cv: "purple",
      mixed: "neutral",
      output: "green",
      pv: "red",
      transfer: "blue",
      unknown: "orange",
    });
    assert.equal(properties["filesExplorerBadgeColors"].type, "object");
    assert.equal(properties["filesExplorerDensity"].default, "compact");
    assert.deepEqual(properties["filesExplorerDensity"].enum, ["compact", "default", "comfortable"]);
    assert.equal(properties["filesExplorerShowBadges"].default, true);
    assert.equal(properties["filesExplorerShowBadges"].type, "boolean");
    assert.equal(properties["numericDisplayMode"].default, "raw");
    assert.deepEqual(properties["numericDisplayMode"].enum, ["raw", "smart"]);
    assert.equal(properties["tableAutoFitColumnWidthsEnabled"].default, false);
    assert.equal(properties["tableAutoFitColumnWidthsEnabled"].type, "boolean");
    assert.equal(properties["tableTemplateVisualizationEnabled"].default, false);
    assert.equal(properties["tableTemplateVisualizationEnabled"].type, "boolean");
    assert.equal(properties["plotAxisSettings"].type, "object");
    assert.equal(CONDUCTOR_CONFIGURATION_KEYS.includes("fileNameFieldSeparators"), false);
    assert.equal(CONDUCTOR_CONFIGURATION_KEYS.includes("templateDisabledBuiltinDomainPackIds"), false);
    assert.equal(CONDUCTOR_CONFIGURATION_KEYS.includes("tableAutoFitColumnWidthsEnabled"), true);
    assert.equal(CONDUCTOR_CONFIGURATION_KEYS.includes("tableTemplateVisualizationEnabled"), true);
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

  test("normalizes numeric display mode", () => {
    assert.equal(normalizeConductorSettings({ numericDisplayMode: "smart" }).numericDisplayMode, "smart");
    assert.equal(normalizeConductorSettings({ numericDisplayMode: "cell" }).numericDisplayMode, "raw");
  });

  test("drops retired filename field separator setting", () => {
    assert.equal(
      Object.hasOwn(normalizeConductorSettings({ fileNameFieldSeparators: "_" }), "fileNameFieldSeparators"),
      false,
    );
  });

  test("drops retired template domain pack setting", () => {
    assert.equal(
      Object.hasOwn(normalizeConductorSettings({ templateDisabledBuiltinDomainPackIds: ["semiconductor-ivcv"] }), "templateDisabledBuiltinDomainPackIds"),
      false,
    );
  });

  test("normalizes table template visualization", () => {
    assert.equal(normalizeConductorSettings({}).tableTemplateVisualizationEnabled, false);
    assert.equal(
      normalizeConductorSettings({ tableTemplateVisualizationEnabled: true }).tableTemplateVisualizationEnabled,
      true,
    );
    assert.equal(
      normalizeConductorSettings({ tableTemplateVisualizationEnabled: "true" }).tableTemplateVisualizationEnabled,
      false,
    );
  });

  test("normalizes table auto-fit column widths", () => {
    assert.equal(normalizeConductorSettings({}).tableAutoFitColumnWidthsEnabled, false);
    assert.equal(
      normalizeConductorSettings({ tableAutoFitColumnWidthsEnabled: true }).tableAutoFitColumnWidthsEnabled,
      true,
    );
    assert.equal(
      normalizeConductorSettings({ tableAutoFitColumnWidthsEnabled: "true" }).tableAutoFitColumnWidthsEnabled,
      false,
    );
  });

  test("normalizes template semantic allowlist field shape without semantic matching filters", () => {
    assert.deepEqual(normalizeConductorSettings({
      templateSemanticAllowlist: [{
        id: "single-i",
        alias: " I ",
        axisTendency: "dependent",
        family: "iv",
        intent: "ivCurve",
        ivMode: "transfer",
        enabled: true,
      }, {
        id: "punctuation",
        alias: ";",
        axisTendency: "dependent",
        enabled: true,
      }, {
        id: "drain-current",
        alias: " Id ",
        axisTendency: "dependent",
        enabled: true,
      }],
    }).templateSemanticAllowlist, [{
      id: "single-i",
      alias: "I",
      axisTendency: "dependent",
      enabled: true,
    }, {
      id: "punctuation",
      alias: ";",
      axisTendency: "dependent",
      enabled: true,
    }, {
      id: "drain-current",
      alias: "Id",
      axisTendency: "dependent",
      enabled: true,
    }]);
  });

  test("normalizes Explorer badge colors", () => {
    assert.deepEqual(normalizeConductorSettings({
      filesExplorerBadgeColors: {
        output: "blue",
        transfer: "magenta",
        unknown: "neutral",
      },
    }).filesExplorerBadgeColors, {
      cf: "cyan",
      cv: "purple",
      mixed: "neutral",
      output: "blue",
      pv: "red",
      transfer: "blue",
      unknown: "neutral",
    });
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
