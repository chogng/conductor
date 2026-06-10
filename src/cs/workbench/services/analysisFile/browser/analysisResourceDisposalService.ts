/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IAnalysisResourceDisposalService,
	type AnalysisResourceDisposalOptions,
	type IAnalysisResourceDisposalService as IAnalysisResourceDisposalServiceType,
} from "src/cs/workbench/services/analysisFile/common/analysisResourceDisposal";

export class AnalysisResourceDisposalService extends Disposable implements IAnalysisResourceDisposalServiceType {
	public declare readonly _serviceBrand: undefined;

	public canDisposeAnalysisResources(): boolean {
		return false;
	}

	public disposeAnalysisResources(_options: AnalysisResourceDisposalOptions): Promise<void> {
		return Promise.resolve();
	}
}

registerSingleton(IAnalysisResourceDisposalService, AnalysisResourceDisposalService, InstantiationType.Delayed);
