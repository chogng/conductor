#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Conductor Studio contributors. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { getVersion } from '../build/lib/git.ts';

const packageJsonMarkerId = 'BUILD_INSERT_PACKAGE_CONFIGURATION';
const tscExtraArgs = process.argv.slice(2);
const isWatch = tscExtraArgs.includes('--watch') || tscExtraArgs.includes('-w');
const projectRoot = process.cwd();
const desktopDistDir = path.join(projectRoot, 'desktop-dist');
const packageJsonPath = path.join(projectRoot, 'package.json');
const bootstrapMetaPath = path.join(desktopDistDir, 'src', 'bootstrap-meta.js');
const packageMarker = new RegExp(
	`${packageJsonMarkerId}:\\s*"${packageJsonMarkerId}"`,
);

const isWin = process.platform === 'win32';
const tscCmd = isWin ? 'cmd.exe' : 'npx';
const tscArgs = isWin
	? ['/d', '/s', '/c', 'npx', 'tsc', '-p', 'tsconfig.desktop.json', ...tscExtraArgs]
	: ['tsc', '-p', 'tsconfig.desktop.json', ...tscExtraArgs];

const inlinePackageConfiguration = (throwOnMissingMarker: boolean): void => {
	mkdirSync(desktopDistDir, { recursive: true });
	copyFileSync(packageJsonPath, path.join(desktopDistDir, 'package.json'));

	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	const commit = getVersion(projectRoot);
	if (commit) {
		// Conductor keeps product identity in bootstrap-meta instead of a separate
		// product.json, so inject the build commit into the inlined package metadata.
		packageJson.commit = commit;
	}
	const packageJsonFields = JSON.stringify(packageJson).slice(1, -1);
	const bootstrapMeta = readFileSync(bootstrapMetaPath, 'utf8');

	if (!packageMarker.test(bootstrapMeta)) {
		if (throwOnMissingMarker) {
			throw new Error(`Package configuration marker not found in ${bootstrapMetaPath}`);
		}
		return;
	}

	writeFileSync(
		bootstrapMetaPath,
		bootstrapMeta.replace(packageMarker, packageJsonFields),
	);
};

const resetBootstrapMetaOutput = (): void => {
	if (!existsSync(bootstrapMetaPath)) {
		return;
	}

	const bootstrapMeta = readFileSync(bootstrapMetaPath, 'utf8');
	if (!packageMarker.test(bootstrapMeta)) {
		unlinkSync(bootstrapMetaPath);
	}
};

const removeLegacyDesktopOutput = (): void => {
	rmSync(path.join(desktopDistDir, 'desktop'), { recursive: true, force: true });
};

resetBootstrapMetaOutput();
removeLegacyDesktopOutput();

if (isWatch) {
	const proc = spawn(tscCmd, tscArgs, { stdio: ['inherit', 'pipe', 'pipe'] });

	const relayOutput = (
		stream: NodeJS.ReadableStream,
		outputTarget: NodeJS.WritableStream,
	): void => {
		stream.setEncoding('utf8');
		stream.on('data', chunk => {
			const text = String(chunk);
			outputTarget.write(text);
			if (text.includes('Watching for file changes.')) {
				inlinePackageConfiguration(false);
			}
		});
	};

	relayOutput(proc.stdout, process.stdout);
	relayOutput(proc.stderr, process.stderr);

	proc.on('exit', code => {
		process.exit(code ?? 1);
	});
	proc.on('error', error => {
		console.error(error.message);
		process.exit(1);
	});
} else {
	const res = spawnSync(tscCmd, tscArgs, { stdio: 'inherit' });
	if ((res.status ?? 1) !== 0) {
		process.exit(res.status ?? 1);
	}

	inlinePackageConfiguration(true);
}
