/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IRcAnalysisBackendService =
	createDecorator<IRcAnalysisBackendService>("rcAnalysisBackendService");

export type RcAnalyzeDevice = {
	readonly fileId: unknown;
	readonly label: string;
	readonly length: number;
	readonly seriesId: unknown;
	readonly vds: number;
	readonly width: number;
	readonly x: readonly number[];
	readonly y: readonly number[];
};

export type RcAnalyzePayload = {
	readonly devices: readonly RcAnalyzeDevice[];
	readonly options: {
		readonly maxGridPoints: number;
		readonly minAbsCurrent: number;
		readonly minDevices: number;
		readonly normalizeByWidth: boolean;
		readonly selectedVg: number | null;
	};
};

export type RcAnalysisResultPayload = {
	readonly message?: string;
	readonly ok?: boolean;
	readonly result?: unknown;
	readonly [key: string]: unknown;
};

export type RcAnalysisBackend = {
	analyzeRc(payload: RcAnalyzePayload): Promise<RcAnalysisResultPayload>;
	canAnalyzeRc(): boolean;
};

export interface IRcAnalysisBackendService extends RcAnalysisBackend {
	readonly _serviceBrand: undefined;
}
