/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IAnalysisResourceDisposalService =
	createDecorator<IAnalysisResourceDisposalService>("analysisResourceDisposalService");
export const AnalysisFileLifecycleContributionId = "workbench.contrib.analysisFileLifecycle";

export type AnalysisResourceDisposalBackend = {
	canDisposeFile(): boolean;
	disposeFile(payload: unknown): Promise<unknown>;
};

export type AnalysisResourceDisposalOptions = {
	readonly clear: boolean;
};

export interface IAnalysisResourceDisposalService {
	readonly _serviceBrand: undefined;

	canDisposeAnalysisResources(): boolean;
	disposeAnalysisResources(options: AnalysisResourceDisposalOptions): Promise<void>;
}
