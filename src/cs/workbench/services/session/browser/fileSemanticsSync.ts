/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ConductorSettings } from "src/cs/workbench/services/settings/common/settings";
import type {
	CurveYScale,
} from "src/cs/workbench/services/session/common/fileSemantics";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
	getFileRecordAxisProjection,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";

export type FileAxisSettingsByFileId = {
	readonly xUnitByFileId: Record<string, string>;
	readonly yScaleByFileId: Record<string, CurveYScale>;
	readonly yUnitByFileId: Record<string, string>;
};

export type FileAxisSettingsInput = {
	readonly conductorSettings?: ConductorSettings | null;
	readonly snapshot: SessionSnapshot;
};

export const getFileAxisSettingsByFileId = (
	input: FileAxisSettingsInput,
): FileAxisSettingsByFileId => {
	const { conductorSettings, snapshot } = input;
	const xUnitByFileId: Record<string, string> = {
		...(conductorSettings?.xUnitByFileId ?? {}),
	};
	const yUnitByFileId: Record<string, string> = {
		...(conductorSettings?.yUnitByFileId ?? {}),
	};
	const yScaleByFileId: Record<string, CurveYScale> = {
		...(conductorSettings?.yScaleByFileId ?? {}),
	};

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
		const xUnit = axis.xUnit;
		const yUnit = axis.yUnit;
		if (xUnit && !xUnitByFileId[fileId]) {
			xUnitByFileId[fileId] = xUnit;
		}
		if (yUnit && !yUnitByFileId[fileId]) {
			yUnitByFileId[fileId] = yUnit;
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
