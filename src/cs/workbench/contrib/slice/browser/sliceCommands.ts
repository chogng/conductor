/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
	IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import {
	INotificationService,
	Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
	getRawTableRefsForFileIds,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	ISessionService,
	type SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type {
	FileRecord,
	RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
	ISliceService,
	type ISliceService as ISliceServiceType,
} from "src/cs/workbench/services/slice/common/slice";
import {
	ITemplateViewStateService,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import {
	isAutoTemplateId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import { createTemplateFromEditorRecord } from "src/cs/workbench/services/template/common/templateEditorAdapter";
import {
	validateTemplateForApply,
} from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
	createInlineTemplateSelection,
	type TemplateSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";

export type RunSliceWithTemplateCommandOptions = {
	readonly incremental?: boolean;
};

export const runSliceWithTemplateHandler = (
	accessor: ServicesAccessor,
	options: RunSliceWithTemplateCommandOptions = {},
): void => {
	const explorerService = accessor.get(IExplorerService);
	const notificationService = accessor.get(INotificationService);
	if (explorerService.hasPendingSourceFiles) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.importing", "Files are still importing. Try again after import finishes."),
			severity: Severity.Warning,
		});
		return;
	}

	const sessionService = accessor.get(ISessionService);
	const sliceService = accessor.get(ISliceService);
	const snapshot = sessionService.getSnapshot();
	const refs = getSliceCommandRawTableRefs(snapshot, Boolean(options.incremental));
	if (!refs.length) {
		notificationService.notify({
			id: "slice.notification",
			message: options.incremental
				? localize("slice.runWithTemplate.noNewFiles", "No new files to slice.")
				: localize("slice.runWithTemplate.noRawTables", "No raw tables are available to slice."),
			severity: Severity.Info,
		});
		return;
	}

	const selection = createSliceCommandTemplateSelection(accessor);
	if (!selection) {
		return;
	}

	runSliceRefsWithTemplate(sliceService, refs, selection);
};

export const getSliceCommandRawTableRefs = (
	snapshot: SessionSnapshot,
	incremental: boolean,
): RawTableRef[] => {
	const fileIds = snapshot.fileOrder.filter(fileId => {
		const file = snapshot.filesById[fileId];
		return file && (!incremental || !hasAnySliceRun(file));
	});
	return getRawTableRefsForFileIds(fileIds, snapshot);
};

const createSliceCommandTemplateSelection = (
	accessor: ServicesAccessor,
): TemplateSelection | null => {
	const templateViewStateService = accessor.get(ITemplateViewStateService);
	const notificationService = accessor.get(INotificationService);
	const state = templateViewStateService.getState();
	if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
		return { kind: "auto" };
	}

	const validation = validateTemplateForApply(state.formState);
	if (!validation.ok || !validation.normalized) {
		notificationService.notify({
			id: "slice.notification",
			message: validation.message || localize("slice.runWithTemplate.invalidTemplate", "Invalid template configuration."),
			severity: Severity.Warning,
		});
		return null;
	}

	const template = createTemplateFromEditorRecord({
		...validation.normalized,
		id: state.selectedTemplateId,
	});
	if (!template) {
		notificationService.notify({
			id: "slice.notification",
			message: localize("slice.runWithTemplate.invalidTemplate", "Invalid template configuration."),
			severity: Severity.Warning,
		});
		return null;
	}

	return createInlineTemplateSelection(template);
};

const runSliceRefsWithTemplate = (
	sliceService: ISliceServiceType,
	refs: readonly RawTableRef[],
	selection: TemplateSelection,
): void => {
	for (const ref of refs) {
		sliceService.runWithTemplate({
			ref,
			selection,
		});
	}
};

const hasAnySliceRun = (file: FileRecord): boolean =>
	Boolean(file.latestSliceRunId) ||
	Object.keys(file.sliceRunsById ?? {}).length > 0;
