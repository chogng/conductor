/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
	CONFIRM_ASSESSMENT_SCHEMA_PROFILE_COMMAND_ID,
	CONFIRM_TABLE_FACTS_SCHEMA_PROFILE_COMMAND_ID,
	confirmTableFactsSchemaProfileFromSession,
} from "src/cs/workbench/contrib/tableFacts/browser/tableFactsCommands";
export type {
	ConfirmTableFactsSchemaProfileCommandArgs,
	ConfirmTableFactsSchemaProfileCommandBinding,
} from "src/cs/workbench/contrib/tableFacts/browser/tableFactsCommands";

import {
	confirmTableFactsSchemaProfileFromSession,
} from "src/cs/workbench/contrib/tableFacts/browser/tableFactsCommands";
import type {
	ConfirmTableFactsSchemaProfileCommandArgs,
	ConfirmTableFactsSchemaProfileCommandBinding,
} from "src/cs/workbench/contrib/tableFacts/browser/tableFactsCommands";

export type ConfirmAssessmentSchemaProfileCommandBinding =
	ConfirmTableFactsSchemaProfileCommandBinding;
export type ConfirmAssessmentSchemaProfileCommandArgs =
	ConfirmTableFactsSchemaProfileCommandArgs;

export const confirmAssessmentSchemaProfileFromSession =
	confirmTableFactsSchemaProfileFromSession;
