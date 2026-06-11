/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  ConfigurationScope,
  type IConfigurationNode,
  type IConfigurationPropertySchema,
} from "src/cs/platform/configuration/common/configurationRegistry";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";

export const pasteAsPreferenceConfig = "editor.pasteAs.preferences";
export const dropAsPreferenceConfig = "editor.dropIntoEditor.preferences";
export const pasteAsCommandId = "editor.action.pasteAs";

const dropAsPreferenceSchema: IConfigurationPropertySchema = {
  type: "array",
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
  description: localize(
    "dropPreferredDescription",
    "Configures the preferred type of edit to use when dropping content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used.",
  ),
  default: [],
  items: {
    description: localize("dropKind", "The kind identifier of the drop edit."),
    type: "string",
  },
};

const pasteAsPreferenceSchema: IConfigurationPropertySchema = {
  type: "array",
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
  description: localize(
    "pastePreferredDescription",
    "Configures the preferred type of edit to use when pasting content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used.",
  ),
  default: [],
  items: {
    description: localize("pasteKind", "The kind identifier of the paste edit."),
    type: "string",
  },
};

export const editorConfiguration = Object.freeze<IConfigurationNode>({
  id: "editor",
  order: 5,
  title: localize("editorConfigurationTitle", "Editor"),
  type: "object",
  properties: {
    [pasteAsPreferenceConfig]: pasteAsPreferenceSchema,
    [dropAsPreferenceConfig]: dropAsPreferenceSchema,
  },
});

export class DropOrPasteSchemaContribution extends Disposable implements IWorkbenchContribution {
  public static readonly ID = "workbench.contrib.dropOrPasteIntoSchema";
}
