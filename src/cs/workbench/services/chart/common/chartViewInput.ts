/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { ProcessingStatus } from "src/cs/workbench/services/session/common/sessionTypes";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";

export type ChartPane = "chart" | "inspector";

export type ChartViewInput = {
	readonly activePlotType?: PlotType;
	readonly hasChartData?: boolean;
	readonly chartFileOptions?: readonly ChartFileOption[];
	readonly processingStatus?: Partial<ProcessingStatus>;
	readonly activeFileId?: string | null;
	readonly showFileSelect?: boolean;
	readonly shouldMountCharts?: boolean;
};
