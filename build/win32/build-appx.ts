#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Conductor Studio contributors. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface IAppxConfig {
	readonly artifactName?: string;
	readonly identityName?: string;
	readonly publisher?: string;
	readonly displayName?: string;
	readonly publisherDisplayName?: string;
}

interface IPackageJson {
	readonly build?: {
		readonly appx?: IAppxConfig;
	};
}

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const packageJsonPath = path.join(rootDir, "package.json");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log("Usage: node --experimental-strip-types build/win32/build-appx.ts");
	console.log("");
	console.log("Builds the Microsoft Store AppX package with electron-builder.");
	process.exit(0);
}

/**
 * Print an AppX build error and stop the process.
 */
function fail(message: string): never {
	console.error(`[build-appx] ${message}`);
	process.exit(1);
}

/**
 * Return whether a package identity value still looks unconfigured.
 */
function isPlaceholder(value: string | undefined): boolean {
	const text = String(value ?? "").trim();
	return !text || /^YOUR_/i.test(text) || /placeholder/i.test(text);
}

/**
 * Read the electron-builder AppX configuration from package.json.
 */
function readAppxConfig(): IAppxConfig {
	if (!fs.existsSync(packageJsonPath)) {
		fail(`package.json not found at: ${packageJsonPath}`);
	}

	const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as IPackageJson;
	const appx = pkg.build?.appx;
	if (!appx) {
		fail("build.appx is missing from package.json.");
	}

	return appx;
}

/**
 * Ensure the Microsoft Store AppX identity fields are ready for packaging.
 */
function verifyAppxConfig(appx: IAppxConfig): void {
	const requiredFields: readonly (keyof IAppxConfig)[] = [
		"artifactName",
		"identityName",
		"publisher",
		"displayName",
		"publisherDisplayName",
	];

	for (const field of requiredFields) {
		if (isPlaceholder(appx[field])) {
			fail(`build.appx.${field} must be configured before building the Store AppX package.`);
		}
	}
}

const appx = readAppxConfig();
verifyAppxConfig(appx);

const builderArgs = [
	"electron-builder",
	"--win",
	"appx",
	"--publish",
	"never",
	"--config.win.signAndEditExecutable=false",
];

console.log(`[build-appx] Running: npx ${builderArgs.join(" ")}`);
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCommand, builderArgs, {
	cwd: rootDir,
	stdio: "inherit",
});

if (result.error) {
	fail(`Failed to start electron-builder: ${result.error.message}`);
}

if (result.status !== 0) {
	fail(`electron-builder failed with exit code ${result.status}.`);
}
