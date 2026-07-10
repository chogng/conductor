#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Conductor Studio contributors. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as ts from 'typescript';
import { getVersion } from '../build/lib/git.ts';

const packageJsonMarkerId = 'BUILD_INSERT_PACKAGE_CONFIGURATION';
const tscExtraArgs = process.argv.slice(2);
const isWatch = tscExtraArgs.includes('--watch') || tscExtraArgs.includes('-w');
const projectRoot = process.cwd();
const desktopTsconfigPath = path.join(projectRoot, 'src', 'tsconfig.desktop.json');
const desktopOutDir = path.join(projectRoot, 'out', 'desktop');
const packageJsonPath = path.join(projectRoot, 'package.json');
const bootstrapMetaPath = path.join(desktopOutDir, 'src', 'bootstrap-meta.js');
const packageMarker = new RegExp(
	`${packageJsonMarkerId}:\\s*"${packageJsonMarkerId}"`,
);

const isWin = process.platform === 'win32';
const tscCmd = isWin ? 'cmd.exe' : 'npx';
const tscArgs = isWin
	? ['/d', '/s', '/c', 'npx', 'tsc', '-p', 'src/tsconfig.desktop.json', ...tscExtraArgs]
	: ['tsc', '-p', 'src/tsconfig.desktop.json', ...tscExtraArgs];

const inlinePackageConfiguration = (throwOnMissingMarker: boolean): void => {
	mkdirSync(desktopOutDir, { recursive: true });
	copyFileSync(packageJsonPath, path.join(desktopOutDir, 'package.json'));

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

const getDesktopBuildFingerprint = (): string => {
	const hash = createHash('sha256');

	const hashDirectory = (directoryPath: string): void => {
		const entries = readdirSync(directoryPath, { withFileTypes: true })
			.sort((left, right) => left.name.localeCompare(right.name));

		for (const entry of entries) {
			const entryPath = path.join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				hashDirectory(entryPath);
				continue;
			}

			const relativePath = path.relative(desktopOutDir, entryPath).replaceAll(path.sep, '/');
			hash.update(relativePath);
			hash.update('\0');
			hash.update(readFileSync(entryPath));
			hash.update('\0');
		}
	};

	hashDirectory(desktopOutDir);
	return hash.digest('hex');
};

interface DesktopBuildReadyMessage {
	readonly type: 'desktopBuildReady';
	readonly fingerprint: string;
}

interface DesktopBuildFailedMessage {
	readonly type: 'desktopBuildFailed';
	readonly errorCount: number;
}

type DesktopBuildMessage = DesktopBuildReadyMessage | DesktopBuildFailedMessage;

const sendDesktopBuildMessage = (message: DesktopBuildMessage): void => {
	if (process.connected && process.send) {
		process.send(message);
	}
};

rmSync(desktopOutDir, { recursive: true, force: true });

if (isWatch) {
	const commandLine = ts.parseCommandLine(tscExtraArgs);
	const diagnosticFormatHost: ts.FormatDiagnosticsHost = {
		getCanonicalFileName: fileName => fileName,
		getCurrentDirectory: () => projectRoot,
		getNewLine: () => ts.sys.newLine,
	};
	const reportDiagnostic = (diagnostic: ts.Diagnostic): void => {
		process.stderr.write(ts.formatDiagnosticsWithColorAndContext([diagnostic], diagnosticFormatHost));
	};

	if (commandLine.errors.length) {
		for (const diagnostic of commandLine.errors) {
			reportDiagnostic(diagnostic);
		}
		process.exit(1);
	}

	const reportWatchStatus: ts.WatchStatusReporter = (_diagnostic, _newLine, _options, errorCount) => {
		if (errorCount === undefined) {
			return;
		}

		if (errorCount > 0) {
			sendDesktopBuildMessage({ type: 'desktopBuildFailed', errorCount });
			return;
		}

		inlinePackageConfiguration(false);
		sendDesktopBuildMessage({
			type: 'desktopBuildReady',
			fingerprint: getDesktopBuildFingerprint(),
		});
	};

	const host = ts.createWatchCompilerHost(
		desktopTsconfigPath,
		commandLine.options,
		ts.sys,
		ts.createEmitAndSemanticDiagnosticsBuilderProgram,
		reportDiagnostic,
		reportWatchStatus,
		commandLine.watchOptions,
	);
	ts.createWatchProgram(host);
} else {
	const res = spawnSync(tscCmd, tscArgs, { stdio: 'inherit' });
	if ((res.status ?? 1) !== 0) {
		process.exit(res.status ?? 1);
	}

	inlinePackageConfiguration(true);
}
