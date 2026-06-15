/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IRcCalculationBackendService,
	type IRcCalculationBackendService as IRcCalculationBackendServiceType,
	type RcCalculationResultPayload,
	type RcCalculatePayload,
} from "src/cs/workbench/services/parameters/common/rcCalculationBackend";

const getServiceUnavailableMessage = (): string =>
	localize("rcCalculation.desktopBridgeUnavailable", "Rust Rc calculation bridge is unavailable.");

function unavailable(): Promise<never> {
	return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class RcCalculationBackendService extends Disposable implements IRcCalculationBackendServiceType {
	public declare readonly _serviceBrand: undefined;

	public calculateRc(_payload: RcCalculatePayload): Promise<RcCalculationResultPayload> {
		return unavailable();
	}

	public canCalculateRc(): boolean {
		return false;
	}
}

registerSingleton(IRcCalculationBackendService, RcCalculationBackendService, InstantiationType.Delayed);
