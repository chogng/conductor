/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";

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

export type TemplateApplyPresetRecord = Partial<TemplateApplyConfig> &
	Partial<{
		readonly id: string | null;
	}> & {
		readonly [key: string]: unknown;
	};
