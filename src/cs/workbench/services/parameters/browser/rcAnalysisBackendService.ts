/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IRcAnalysisBackendService,
	type IRcAnalysisBackendService as IRcAnalysisBackendServiceType,
	type RcAnalysisResultPayload,
	type RcAnalyzePayload,
} from "src/cs/workbench/services/parameters/common/rcAnalysisBackend";

const getServiceUnavailableMessage = (): string =>
	localize("rcAnalysis.desktopBridgeUnavailable", "Rust Rc bridge is unavailable.");

function unavailable(): Promise<never> {
	return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class RcAnalysisBackendService extends Disposable implements IRcAnalysisBackendServiceType {
	public declare readonly _serviceBrand: undefined;

	public analyzeRc(_payload: RcAnalyzePayload): Promise<RcAnalysisResultPayload> {
		return unavailable();
	}

	public canAnalyzeRc(): boolean {
		return false;
	}
}

registerSingleton(IRcAnalysisBackendService, RcAnalysisBackendService, InstantiationType.Delayed);
