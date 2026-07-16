/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { PlotFileAxisSettings } from "src/cs/workbench/services/plot/common/plot";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import { getFileRecordAxisProjection } from "src/cs/workbench/services/session/common/sessionFileProjection";

export type PlotFileAxisSettingsOverrides = {
	readonly xUnitByFileId?: Readonly<Record<string, string>>;
	readonly yScaleByFileId?: Readonly<Record<string, "linear" | "log" | string>>;
	readonly yUnitByFileId?: Readonly<Record<string, string>>;
};

export type PlotFileAxisSettingsInput = {
	readonly axisSettings?: PlotFileAxisSettingsOverrides | null;
	readonly snapshot: SessionSnapshot;
};

export const getPlotFileAxisSettings = (
	input: PlotFileAxisSettingsInput,
): PlotFileAxisSettings => {
	const { axisSettings, snapshot } = input;
	const xUnitByFileId: Record<string, string> = {
		...(axisSettings?.xUnitByFileId ?? {}),
	};
	const yUnitByFileId: Record<string, string> = {
		...(axisSettings?.yUnitByFileId ?? {}),
	};
	const yScaleByFileId: Record<string, "linear" | "log"> = {};
	for (const [fileId, scale] of Object.entries(axisSettings?.yScaleByFileId ?? {})) {
		if (scale === "linear" || scale === "log") {
			yScaleByFileId[fileId] = scale;
		}
	}

	const seenFileIds = new Set<string>();
	const applyFile = (fileId: string): void => {
		if (seenFileIds.has(fileId)) {
			return;
		}
		seenFileIds.add(fileId);

		const file = snapshot.filesById[fileId];
		if (!file) {
			return;
		}

		const axis = getFileRecordAxisProjection(file);
		if (axis.xUnit && !xUnitByFileId[fileId]) {
			xUnitByFileId[fileId] = axis.xUnit;
		}
		if (axis.yUnit && !yUnitByFileId[fileId]) {
			yUnitByFileId[fileId] = axis.yUnit;
		}
	};

	for (const fileId of snapshot.fileOrder) {
		applyFile(fileId);
	}
	for (const fileId of Object.keys(snapshot.filesById)) {
		applyFile(fileId);
	}

	return {
		xUnitByFileId,
		yScaleByFileId,
		yUnitByFileId,
	};
};
