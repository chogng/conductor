/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import {
	resolveChartFileOptions,
	type ChartFileOption,
} from "src/cs/workbench/services/chart/common/chartFileOptions";

export function createFileSelect(
	props: ChartViewInput,
	activeFile: ChartFileOption,
	store: DisposableStore,
): HTMLSelectElement {
	const select = document.createElement("select");
	select.className = "chart_view_file_select dropdown-field dropdown-field--sm";
	select.value = activeFile.fileId;
	for (const file of resolveChartFileOptions(props)) {
		const fileId = file.fileId;
		if (!fileId) {
			continue;
		}

		const option = document.createElement("option");
		option.value = fileId;
		option.textContent = file.fileName.replace(/\.csv$/i, "");
		select.append(option);
	}
	store.add(addDisposableListener(select, EventType.CHANGE, () => {
		props.onActiveFileIdChange?.(select.value || null);
	}));
	return select;
}
