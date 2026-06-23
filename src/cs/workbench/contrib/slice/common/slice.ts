/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const SliceCommandId = {
	runWithTemplate: "slice.runWithTemplate",
	runWithTemplateIncremental: "slice.runWithTemplateIncremental",
} as const;

export type SliceCommandId =
	typeof SliceCommandId[keyof typeof SliceCommandId];
