import assert from "assert";

import { ConfigurationTarget } from "src/cs/platform/configuration/common/configuration";
import {
  Configuration,
  ConfigurationChangeEvent,
  ConfigurationModel,
  parseConfigurationModel,
} from "src/cs/platform/configuration/common/configurationModels";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/configuration/common/configurationModels", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merges configuration models by layer order", () => {
    const defaults = parseConfigurationModel({
      "editor.fontSize": 12,
      "workbench.sidebar.visible": true,
    });
    const user = parseConfigurationModel({
      "editor.fontSize": 14,
    });
    const workspace = parseConfigurationModel({
      "workbench.sidebar.visible": false,
    });

    const configuration = new Configuration(
      defaults,
      ConfigurationModel.createEmptyModel(),
      user,
      ConfigurationModel.createEmptyModel(),
      workspace,
      ConfigurationModel.createEmptyModel(),
    );

    assert.equal(configuration.getValue("editor.fontSize"), 14);
    assert.equal(configuration.getValue("workbench.sidebar.visible"), false);
  });

  test("applies override identifiers over base values", () => {
    const defaults = parseConfigurationModel({
      "editor.tabSize": 4,
      "[json]": {
        "editor.tabSize": 2,
      },
    });

    const configuration = new Configuration(
      defaults,
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
    );

    assert.equal(configuration.getValue("editor.tabSize"), 4);
    assert.equal(
      configuration.getValue("editor.tabSize", { overrideIdentifier: "json" }),
      2,
    );
    assert.deepEqual(configuration.inspect("editor.tabSize").overrideIdentifiers, ["json"]);
  });

  test("change event checks override value differences", () => {
    const previous = new Configuration(
      parseConfigurationModel({
        "editor.tabSize": 4,
        "[json]": {
          "editor.tabSize": 2,
        },
      }),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
    );
    const current = new Configuration(
      parseConfigurationModel({
        "editor.tabSize": 4,
        "[json]": {
          "editor.tabSize": 3,
        },
      }),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
    );
    const event = new ConfigurationChangeEvent(
      {
        keys: [],
        overrides: [["json", ["editor.tabSize"]]],
      },
      previous,
      current,
      ConfigurationTarget.DEFAULT,
    );

    assert.equal(event.affectsConfiguration("editor.tabSize"), true);
    assert.equal(
      event.affectsConfiguration("editor.tabSize", { overrideIdentifier: "json" }),
      true,
    );
  });

  test("compares shared override identifiers without recursive override diffing", () => {
    const configuration = new Configuration(
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      parseConfigurationModel({
        "[json]": {
          "editor.tabSize": 2,
        },
      }),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
    );

    const change = configuration.compareAndUpdateLocalUserConfiguration(
      parseConfigurationModel({
        "[json]": {
          "editor.tabSize": 3,
        },
      }),
    );

    assert.deepEqual(change.keys, []);
    assert.deepEqual(change.overrides, [["json", ["editor.tabSize"]]]);
  });
});
