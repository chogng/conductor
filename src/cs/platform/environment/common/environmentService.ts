/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

const USER_CONFIGURATION_DIRECTORY = 'User';
const USER_SETTINGS_FILE = 'settings.json';

/**
 * Returns the root directory for persisted application settings.
 */
export function getAppSettingsHome(userDataPath: string): URI {
	const normalizedPath = String(userDataPath ?? '').trim();
	if (!normalizedPath) {
		throw new Error('Cannot resolve application settings home without a user data path.');
	}

	return URI.joinPath(URI.file(normalizedPath), USER_CONFIGURATION_DIRECTORY);
}

/**
 * Returns the user settings resource under the application settings home.
 */
export function getUserSettingsResource(userDataPath: string): URI {
	return URI.joinPath(getAppSettingsHome(userDataPath), USER_SETTINGS_FILE);
}
