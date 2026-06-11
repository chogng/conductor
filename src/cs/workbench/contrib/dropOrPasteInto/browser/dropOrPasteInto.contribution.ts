/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  Extensions,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
} from "src/cs/workbench/common/contributions";
import { DropOrPasteIntoCommands } from "src/cs/workbench/contrib/dropOrPasteInto/browser/commands";
import {
  DropOrPasteSchemaContribution,
  editorConfiguration,
} from "src/cs/workbench/contrib/dropOrPasteInto/browser/configurationSchema";

registerWorkbenchContribution2(DropOrPasteIntoCommands.ID, DropOrPasteIntoCommands, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(DropOrPasteSchemaContribution.ID, DropOrPasteSchemaContribution, WorkbenchPhase.Eventually);

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
  .registerConfiguration(editorConfiguration);
