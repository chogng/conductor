/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'src/cs/platform/instantiation/common/extensions';
import { INotificationService } from 'src/cs/platform/notification/common/notification';
import {
	IProgressService,
	ProgressLocation,
	Progress,
	type IProgress,
	type IProgressOptions,
	type IProgressStep,
} from 'src/cs/platform/progress/common/progress';

export class ProgressService implements IProgressService {
	public declare readonly _serviceBrand: undefined;

	public constructor(
		@INotificationService private readonly notificationService: INotificationService,
	) {}

	public async withProgress<R>(
		options: IProgressOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<R>,
		onDidCancel?: () => void,
	): Promise<R> {
		void onDidCancel;

		const status = options.location === ProgressLocation.Window && options.title
			? this.notificationService.status(options.title, { showAfter: options.delay })
			: undefined;
		try {
			return await task(new Progress<IProgressStep>(() => undefined));
		} finally {
			status?.close();
		}
	}
}

registerSingleton(IProgressService, ProgressService, InstantiationType.Delayed);
