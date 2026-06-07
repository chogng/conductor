import assert from "assert";

import {
  ConfigurationTarget,
  createConfigurationChangeEvent,
  getConfigValueInTarget,
  isConfigurationOverrides,
  isConfigurationUpdateOverrides,
  isConfigured,
  toValuesTree,
} from "src/cs/platform/configuration/common/configuration";

suite("platform/configuration/common/configuration", () => {
  test("creates values tree from dotted keys", () => {
    const conflicts: string[] = [];
    const tree = toValuesTree({
      "workbench.sidebar.visible": true,
      "workbench.sidebar.width": 300,
      "editor.fontSize": 14,
    }, message => conflicts.push(message));

    assert.deepEqual(tree, {
      workbench: {
        sidebar: {
          visible: true,
          width: 300,
        },
      },
      editor: {
        fontSize: 14,
      },
    });
    assert.deepEqual(conflicts, []);
  });

  test("reports tree conflicts without replacing existing values", () => {
    const conflicts: string[] = [];
    const tree = toValuesTree({
      "workbench.sidebar": true,
      "workbench.sidebar.width": 300,
    }, message => conflicts.push(message));

    assert.deepEqual(tree, {
      workbench: {
        sidebar: true,
      },
    });
    assert.equal(conflicts.length, 1);
  });

  test("reads inspect values by target", () => {
    const value = {
      defaultValue: 1,
      userValue: 2,
      workspaceValue: 3,
      value: 3,
    };

    assert.equal(getConfigValueInTarget(value, ConfigurationTarget.DEFAULT), 1);
    assert.equal(getConfigValueInTarget(value, ConfigurationTarget.USER), 2);
    assert.equal(getConfigValueInTarget(value, ConfigurationTarget.WORKSPACE), 3);
    assert.equal(isConfigured(value), true);
  });

  test("narrows override shapes", () => {
    assert.equal(isConfigurationOverrides({ overrideIdentifier: "typescript" }), true);
    assert.equal(isConfigurationOverrides({ overrideIdentifier: 12 }), false);
    assert.equal(isConfigurationUpdateOverrides({ overrideIdentifiers: ["typescript"] }), true);
    assert.equal(isConfigurationUpdateOverrides({ overrideIdentifier: "typescript" }), false);
    assert.equal(isConfigurationUpdateOverrides({ overrideIdentifiers: [12] }), false);
  });

  test("change event matches child keys", () => {
    const event = createConfigurationChangeEvent(
      ["workbench.sidebar.width"],
      ConfigurationTarget.USER,
    );

    assert.equal(event.affectsConfiguration("workbench"), true);
    assert.equal(event.affectsConfiguration("workbench.sidebar"), true);
    assert.equal(event.affectsConfiguration("editor"), false);
  });
});
