/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	ITemplateProcessingBackendService,
	type ITemplateProcessingBackendService as ITemplateProcessingBackendServiceType,
	type TemplateProcessingResultPayload,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";
import type {
	FileConverterConvertedCsv,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

const getServiceUnavailableMessage = (): string =>
	localize("templateProcessing.desktopBridgeUnavailable", "Template processing desktop bridge unavailable.");

function unavailable(): Promise<never> {
	return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class TemplateProcessingBackendService extends Disposable implements ITemplateProcessingBackendServiceType {
	public declare readonly _serviceBrand: undefined;

	public canProcessFile(): boolean {
		return false;
	}

	public canReadConvertedCsv(): boolean {
		return false;
	}

	public processFile(_payload: unknown): Promise<TemplateProcessingResultPayload> {
		return unavailable();
	}

	public readConvertedCsv(_payload: { path: string }): Promise<FileConverterConvertedCsv> {
		return Promise.resolve({ ok: false });
	}
}

registerSingleton(ITemplateProcessingBackendService, TemplateProcessingBackendService, InstantiationType.Delayed);
