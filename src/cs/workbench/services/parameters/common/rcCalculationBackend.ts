/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IRcCalculationBackendService =
	createDecorator<IRcCalculationBackendService>("rcCalculationBackendService");

export type RcCalculateDevice = {
	readonly fileId: unknown;
	readonly label: string;
	readonly length: number;
	readonly seriesId: unknown;
	readonly vds: number;
	readonly width: number;
	readonly x: readonly number[];
	readonly y: readonly number[];
};

export type RcCalculatePayload = {
	readonly devices: readonly RcCalculateDevice[];
	readonly options: {
		readonly maxGridPoints: number;
		readonly minAbsCurrent: number;
		readonly minDevices: number;
		readonly normalizeByWidth: boolean;
		readonly selectedVg: number | null;
	};
};

export type RcCalculationResultPayload = {
	readonly message?: string;
	readonly ok?: boolean;
	readonly result?: unknown;
	readonly [key: string]: unknown;
};

export type RcCalculationBackend = {
	calculateRc(payload: RcCalculatePayload): Promise<RcCalculationResultPayload>;
	canCalculateRc(): boolean;
};

export interface IRcCalculationBackendService extends RcCalculationBackend {
	readonly _serviceBrand: undefined;
}
