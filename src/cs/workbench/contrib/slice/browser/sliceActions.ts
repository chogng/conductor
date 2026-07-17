/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
	runSliceWithTemplateHandler,
} from "src/cs/workbench/contrib/slice/browser/sliceCommands";
import {
	RUN_SLICE_WITH_TEMPLATE_COMMAND_ID,
	RUN_SLICE_WITH_TEMPLATE_INCREMENTAL_COMMAND_ID,
} from "src/cs/workbench/contrib/slice/common/slice";

export class RunSliceWithTemplateAction extends Action2 {
	public constructor() {
		super({
			category: localize("slice.commands.category", "Slice"),
			f1: true,
			id: RUN_SLICE_WITH_TEMPLATE_COMMAND_ID,
			title: localize("slice.commands.runWithTemplate", "Run Slice with Template"),
			metadata: {
				description: localize("slice.commands.runWithTemplate.description", "Slice all files with the selected template."),
			},
		});
	}

	public run(accessor: ServicesAccessor): void {
		runSliceWithTemplateHandler(accessor);
	}
}

export class RunSliceWithTemplateIncrementalAction extends Action2 {
	public constructor() {
		super({
			category: localize("slice.commands.category", "Slice"),
			f1: true,
			id: RUN_SLICE_WITH_TEMPLATE_INCREMENTAL_COMMAND_ID,
			title: localize("slice.commands.runWithTemplateIncremental", "Run Slice with Template for New Files"),
			metadata: {
				description: localize("slice.commands.runWithTemplateIncremental.description", "Slice files that do not already have slice output."),
			},
		});
	}

	public run(accessor: ServicesAccessor): void {
		runSliceWithTemplateHandler(accessor, { incremental: true });
	}
}
