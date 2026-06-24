/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const RETIRED_STORE_DATA_FILES: readonly string[] = Object.freeze([
	"config.json",
	"template.json",
	"store-path.json",
]);
const DEFAULT_STORE_DATA_FILES: readonly string[] = Object.freeze([
	"config.json",
	"template.json",
]);
const STORE_CONFIG_FILENAME = "store-path.json";

interface StorePathConfig {
	readonly customStorePath?: string | null;
}

export function deleteRetiredStoreDataFiles(
	retiredHomeDir: string,
	files: readonly string[] = RETIRED_STORE_DATA_FILES,
): string[] {
	const retiredRoot = path.resolve(retiredHomeDir);
	const deletedFiles: string[] = [];

	for (const fileName of files) {
		const filePath = path.join(retiredRoot, fileName);
		if (!fs.existsSync(filePath)) {
			continue;
		}

		if (!fs.statSync(filePath).isFile()) {
			continue;
		}

		fs.unlinkSync(filePath);
		deletedFiles.push(filePath);
	}

	return deletedFiles;
}

function readCustomStorePath(userDataHomeDir: string): string | null {
	const storeConfigPath = path.join(userDataHomeDir, STORE_CONFIG_FILENAME);
	if (!fs.existsSync(storeConfigPath) || !fs.statSync(storeConfigPath).isFile()) {
		return null;
	}

	try {
		const parsed = JSON.parse(fs.readFileSync(storeConfigPath, "utf8")) as StorePathConfig;
		return typeof parsed.customStorePath === "string" && parsed.customStorePath.trim()
			? parsed.customStorePath.trim()
			: null;
	} catch {
		return null;
	}
}

function migrateFileIfTargetMissing(previousPath: string, currentPath: string): void {
	if (previousPath === currentPath) {
		return;
	}

	if (!fs.existsSync(previousPath) || fs.existsSync(currentPath)) {
		return;
	}

	fs.mkdirSync(path.dirname(currentPath), { recursive: true });
	try {
		fs.renameSync(previousPath, currentPath);
	} catch {
		fs.copyFileSync(previousPath, currentPath);
		fs.unlinkSync(previousPath);
	}
}

export function migrateCustomStoreDataToDefault(
	userDataHomeDir: string,
	files: readonly string[] = DEFAULT_STORE_DATA_FILES,
): string[] {
	// Temporary compatibility for the removed custom store path. Keep this
	// migration for two releases, then remove this retired-path cleaner.
	const customStorePath = readCustomStorePath(userDataHomeDir);
	const storeConfigPath = path.join(userDataHomeDir, STORE_CONFIG_FILENAME);
	if (!customStorePath || !path.isAbsolute(customStorePath)) {
		return deleteRetiredStoreDataFiles(userDataHomeDir, [STORE_CONFIG_FILENAME]);
	}

	const defaultRoot = path.resolve(userDataHomeDir);
	const customRoot = path.resolve(path.dirname(customStorePath));
	if (customRoot === defaultRoot) {
		return deleteRetiredStoreDataFiles(userDataHomeDir, [STORE_CONFIG_FILENAME]);
	}

	const migratedFiles: string[] = [];
	for (const fileName of files) {
		const previousPath = path.join(customRoot, fileName);
		const currentPath = path.join(defaultRoot, fileName);
		const currentExists = fs.existsSync(currentPath);
		migrateFileIfTargetMissing(previousPath, currentPath);
		if (!currentExists && fs.existsSync(currentPath)) {
			migratedFiles.push(currentPath);
		}
	}

	if (fs.existsSync(storeConfigPath) && fs.statSync(storeConfigPath).isFile()) {
		fs.unlinkSync(storeConfigPath);
	}

	return migratedFiles;
}

export function cleanRetiredStoreData(
	context: SharedProcessContributionContext,
): void {
	try {
		const cleanedFiles = [
			...deleteRetiredStoreDataFiles(context.analysisHomeDir),
			...migrateCustomStoreDataToDefault(context.conductorUserDataHomeDir),
		];
		for (const filePath of cleanedFiles) {
			context.log(`[shared-process] Cleaned retired store data file: ${filePath}`);
		}
	} catch (error) {
		context.warn(
			`[shared-process] Failed to clean retired store data: ${context.analysisHomeDir}`,
			error,
		);
	}
}
