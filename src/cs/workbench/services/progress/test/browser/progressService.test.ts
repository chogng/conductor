/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { ProgressLocation } from 'src/cs/platform/progress/common/progress';
import { NotificationService } from 'src/cs/workbench/services/notification/common/notificationService';
import { ProgressService } from 'src/cs/workbench/services/progress/browser/progressService';

suite('workbench/services/progress/browser/progressService', () => {
	test('runs tasks through the progress service boundary', async () => {
		const notificationService = new NotificationService();
		const service = new ProgressService(notificationService);
		const steps: string[] = [];

		try {
			const result = await service.withProgress(
				{
					location: ProgressLocation.Window,
					title: 'Importing',
				},
				async progress => {
					assert.equal(notificationService.statusMessage?.message, 'Importing');
					progress.report({ message: 'Preparing' });
					steps.push('task');
					return 42;
				},
			);

			assert.deepEqual({
				result,
				statusMessage: notificationService.statusMessage,
				steps,
			}, {
				result: 42,
				statusMessage: undefined,
				steps: ['task'],
			});
		} finally {
			notificationService.dispose();
		}
	});

	test('propagates task failures', async () => {
		const notificationService = new NotificationService();
		const service = new ProgressService(notificationService);
		const failure = new Error('Import failed');

		try {
			await assert.rejects(
				service.withProgress(
					{ location: ProgressLocation.Window },
					async () => {
						throw failure;
					},
				),
				(error: unknown) => error === failure,
			);
		} finally {
			notificationService.dispose();
		}
	});
});
