/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import { createDecorator } from 'src/cs/platform/instantiation/common/instantiation';
import type { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';

export const IWebWorkerService = createDecorator<IWebWorkerService>('webWorkerService');

export interface IWebWorkerService {
	readonly _serviceBrand: undefined;

	createWorkerClient<TProxy extends object>(descriptor: WebWorkerDescriptor): IWebWorkerClient<TProxy>;
	isSupported(): boolean;
}
