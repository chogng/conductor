/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const ICalculationService = createDecorator<ICalculationService>("calculationService");
export const CalculationContributionId = "workbench.services.calculation";

export type CalculationFileId = string;

export interface ICalculationService {
	readonly _serviceBrand: undefined;

	prioritizeCalculationFile(fileId: CalculationFileId | null | undefined): void;
	prioritizeCalculationFiles(fileIds: readonly (CalculationFileId | null | undefined)[]): void;
}

export type {
	CalculatedDataKind,
	CalculationKind,
	CalculationPoint,
	IonIoffMethod,
	SsMethod,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
