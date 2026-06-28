/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { SliceUriTarget } from "src/cs/workbench/services/slice/common/slice";
import type { ChartFileOption } from "src/cs/workbench/services/chart/common/chartFileOptions";


export type ChartPane = "chart" | "inspector";

export type ChartProcessingStatus = {
	readonly message?: string;
	readonly processed?: number;
	readonly progress?: number;
	readonly state?: string;
	readonly total?: number;
};

export type ChartViewInput = {
	readonly activeTarget?: SliceUriTarget | null;
	readonly activePlotType?: PlotType;
	readonly hasChartData?: boolean;
	readonly chartFileOptions?: readonly ChartFileOption[];
	readonly processingStatus?: Partial<ChartProcessingStatus>;
	readonly activeFileId?: string | null;
	readonly activeTarget?: SliceUriTarget | null;
	readonly showFileSelect?: boolean;
	readonly shouldMountCharts?: boolean;
};
