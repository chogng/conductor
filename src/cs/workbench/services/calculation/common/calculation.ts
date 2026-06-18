/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { FileId } from "src/cs/workbench/services/session/common/sessionModel";

export const ICalculationService = createDecorator<ICalculationService>("calculationService");
export const CalculationContributionId = "workbench.services.calculation";

export interface ICalculationService {
	readonly _serviceBrand: undefined;

	prioritizeCalculationFile(fileId: FileId | null | undefined): void;
	prioritizeCalculationFiles(fileIds: readonly (FileId | null | undefined)[]): void;
}

export type {
	CalculatedDataKind,
	CalculationKind,
	CalculationPoint,
	IonIoffMethod,
	SsMethod,
} from "src/cs/workbench/services/calculation/common/calculationTypes";
