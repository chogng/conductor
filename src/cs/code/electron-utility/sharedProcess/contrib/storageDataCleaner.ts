/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const WORKSPACE_STORAGE_DIR = "workspaceStorage";

const isDirectWorkspaceStorageChild = (
	workspaceStorageHome: string,
	targetPath: string,
): boolean => path.dirname(path.resolve(targetPath)) === path.resolve(workspaceStorageHome);

export function deleteEmptyWorkspaceStorageFolders(
	workspaceStorageHome: string,
): string[] {
	if (!fs.existsSync(workspaceStorageHome)) {
		return [];
	}

	const deletedFolders: string[] = [];
	const entries = fs.readdirSync(workspaceStorageHome, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		const targetPath = path.join(workspaceStorageHome, entry.name);
		if (!isDirectWorkspaceStorageChild(workspaceStorageHome, targetPath)) {
			continue;
		}

		if (fs.readdirSync(targetPath).length > 0) {
			continue;
		}

		fs.rmdirSync(targetPath);
		deletedFolders.push(targetPath);
	}

	return deletedFolders;
}

export function cleanUnusedWorkspaceStorageData(
	context: SharedProcessContributionContext,
): void {
	const workspaceStorageHome = path.join(context.conductorUserDataHomeDir, WORKSPACE_STORAGE_DIR);
	try {
		for (const folderPath of deleteEmptyWorkspaceStorageFolders(workspaceStorageHome)) {
			context.log(`[shared-process] Cleaned unused workspace storage folder: ${folderPath}`);
		}
	} catch (error) {
		context.warn(
			`[shared-process] Failed to clean workspace storage data: ${workspaceStorageHome}`,
			error,
		);
	}
}
