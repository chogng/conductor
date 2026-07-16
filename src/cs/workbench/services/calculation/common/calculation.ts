/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	FileRecordAxisProjection,
} from "src/cs/workbench/services/calculation/common/canonicalFileProjection";
import type {
	CurveRecord,
	MetricRecord,
	SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export const ICalculationService = createDecorator<ICalculationService>("calculationService");
export const CalculationContributionId = "workbench.services.calculation";

export type CalculationResourceIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

export type CalculationResourceResult = CalculationResourceIdentity & {
	readonly axis: FileRecordAxisProjection;
	readonly completedAt: number;
	readonly curvesByKey: Readonly<Record<string, CurveRecord>>;
	readonly inputSignature: string;
	readonly metricsByKey: Readonly<Record<string, MetricRecord>>;
	readonly requestSignature: string;
	readonly seriesById: Readonly<Record<string, SeriesRecord>>;
	readonly seriesOrder: readonly string[];
	readonly sourceModelVersion: number;
	readonly sourceVersion: number;
};

export interface ICalculationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeResourceCalculationResult: Event<CalculationResourceIdentity>;

	getResourceResult(resource: URI, sheetId?: string | null): CalculationResourceResult | null;
	prioritizeResource(resource: URI, sheetId?: string | null): void;
}

export type {
	CalculatedDataKind,
	CalculationKind,
	CalculationPoint,
	IonIoffMethod,
	SsMethod,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
