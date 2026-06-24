/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";

export type {
	Template,
	TemplateApplicability,
	TemplateAxisBinding,
	TemplateBlock,
	TemplateColumnRange,
	TemplateLegend,
	TemplateRowRange,
	TemplateSegmentation,
	TemplateTitles,
} from "src/cs/workbench/services/template/common/templateSpec";

export type TemplateEditorRecord = Partial<TemplateEditorConfig> &
	Partial<{
		readonly id: string | null;
	}> & {
		readonly [key: string]: unknown;
	};
