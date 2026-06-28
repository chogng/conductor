/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  ConfigurationScope,
  Extensions as ConfigurationExtensions,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";

export const KEYBOARD_KEYBINDINGS_CONFIGURATION_KEY = "keyboard.keybindings";

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "keyboard",
  title: "Keyboard",
  type: "object",
  properties: {
    [KEYBOARD_KEYBINDINGS_CONFIGURATION_KEY]: {
      type: "array",
      default: [],
      scope: ConfigurationScope.APPLICATION,
      description: "User keybinding overrides. Use { key, command, when?, args? }; prefix command with '-' to remove a default keybinding.",
      items: {
        type: "object",
        required: ["key", "command"],
        additionalProperties: false,
        properties: {
          key: {
            type: "string",
            description: "Keybinding label with concrete modifiers, for example 'ctrl+p', 'cmd+p', or 'ctrl+k ctrl+s'.",
          },
          command: {
            type: "string",
            description: "Command id. Prefix with '-' to remove a default keybinding.",
          },
          when: {
            type: "string",
            description: "Optional context key expression.",
          },
          args: {
            description: "Optional command arguments.",
          },
        },
      },
    },
  },
});
