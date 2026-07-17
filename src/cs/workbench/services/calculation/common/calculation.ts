/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
	CalculationAxis,
	CalculationCurveRecord,
	CalculationMetricRecord,
	CalculationSeriesRecord,
} from "src/cs/workbench/services/calculation/common/calculationRecords";

export const ICalculationService = createDecorator<ICalculationService>("calculationService");
export const CalculationContributionId = "workbench.services.calculation";

export type CalculationResourceIdentity = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

export function createCalculationResourceId(
	resource: URI,
	sheetId?: string | null,
): string {
	const resourceId = resource.toString().replace(/\\/g, "/");
	const normalizedSheetId = String(sheetId ?? "").trim();
	return normalizedSheetId ? `${resourceId}\u0000${normalizedSheetId}` : resourceId;
}

export type CalculationResourceResult = CalculationResourceIdentity & {
	readonly axis: CalculationAxis;
	readonly completedAt: number;
	readonly curvesByKey: Readonly<Record<string, CalculationCurveRecord>>;
	readonly inputSignature: string;
	readonly metricsByKey: Readonly<Record<string, CalculationMetricRecord>>;
	readonly requestSignature: string;
	readonly seriesById: Readonly<Record<string, CalculationSeriesRecord>>;
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
