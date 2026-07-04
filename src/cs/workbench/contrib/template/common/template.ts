/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const TemplateViewContainerId = "workbench.viewContainer.template";
export const TemplateViewId = "workbench.template.auxiliarybar";

export const TemplateCommandId = {
	selectTemplate: "template.selectTemplate",
	createTemplate: "template.createTemplate",
	deleteTemplate: "template.deleteTemplate",
	importTemplate: "template.importTemplate",
	editTemplate: "template.editTemplate",
	exportTemplate: "template.exportTemplate",
	applyTemplate: "template.applyTemplate",
	applyTemplateIncremental: "template.applyTemplateIncremental",
	setStopOnError: "template.setStopOnError",
} as const;

export type TemplateCommandId =
	typeof TemplateCommandId[keyof typeof TemplateCommandId];
