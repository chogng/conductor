#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import {
	calculateGmPoints,
} from "../src/cs/workbench/services/calculation/common/gm.ts";
import {
	computeBaseCurrentMetrics,
} from "../src/cs/workbench/services/calculation/common/ionIoff.ts";
import {
	calculateSsPoints,
	computeSubthresholdSwingFitAuto,
} from "../src/cs/workbench/services/calculation/common/ss.ts";

const ROOT = process.cwd();
const REPORT_TAG = "rust-calculation-parity";
const OUTPUT_DIR = path.join(ROOT, ".build", "verify", REPORT_TAG);
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");

const makeRange = (count, readValue) =>
	Array.from({ length: count }, (_value, index) => readValue(index));

const fixtures = [
	{
		fileId: "transfer-forward",
		points: makeRange(41, (index) => {
			const x = index / 40;
			return { x, y: 10 ** (-12 + (8 * x)) };
		}),
		sourceFile: {
			curveType: "transfer",
			supportsSs: true,
			xAxisRole: "vg",
			xLabel: "Gate Voltage",
		},
	},
	{
		fileId: "transfer-bidirectional",
		points: [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 1.5, 1, 0.5, 0, -0.5, -1, -1.5, -2]
			.map((x, index) => ({
				x,
				y: 10 ** (-11 + (1.8 * x)) * (index > 8 ? 1.05 : 1),
			})),
		sourceFile: {
			curveType: "transfer",
			supportsSs: true,
			xAxisRole: "vg",
			xLabel: "Vg",
		},
	},
	{
		fileId: "output-forward",
		points: makeRange(25, (index) => {
			const x = index / 12;
			return { x, y: (0.002 * x) + (0.0001 * x * x) };
		}),
		sourceFile: {
			curveType: "output",
			supportsSs: false,
			xAxisRole: "vd",
			xLabel: "Drain Voltage",
		},
	},
];

const resolveWorkerCommand = async () => {
	if (process.env.CONDUCTOR_RS_CLI_PATH) {
		const candidate = path.resolve(process.env.CONDUCTOR_RS_CLI_PATH);
		const stat = await fs.stat(candidate);
		if (!stat.isFile()) {
			throw new Error(`CONDUCTOR_RS_CLI_PATH does not point to a file: ${candidate}`);
		}
		return {
			args: ["--stdio-worker"],
			command: candidate,
			label: candidate,
		};
	}

	return {
		args: ["run", "--quiet", "--manifest-path", "cli/Cargo.toml", "--", "--stdio-worker"],
		command: "cargo",
		label: "cargo run --manifest-path cli/Cargo.toml -- --stdio-worker",
	};
};

const createWorker = ({ command, args, label }) => {
	const child = spawn(command, args, {
		cwd: ROOT,
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
	});
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");

	let stdoutBuffer = "";
	let nextId = 0;
	const pending = new Map();

	child.stdout.on("data", (chunk) => {
		stdoutBuffer += String(chunk ?? "");
		while (true) {
			const newlineIndex = stdoutBuffer.indexOf("\n");
			if (newlineIndex < 0) {
				break;
			}
			const line = stdoutBuffer.slice(0, newlineIndex).trim();
			stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
			if (!line) {
				continue;
			}
			const message = JSON.parse(line);
			const entry = pending.get(message.id);
			if (!entry) {
				continue;
			}
			pending.delete(message.id);
			clearTimeout(entry.timeoutId);
			if (message.ok) {
				entry.resolve(message.result);
			} else {
				entry.reject(new Error(message.error?.message || "conductor-rs failed"));
			}
		}
	});

	child.stderr.on("data", (chunk) => {
		const text = String(chunk ?? "").trim();
		if (text) {
			console.warn(`[conductor-rs] ${text}`);
		}
	});

	child.on("exit", (code, signal) => {
		const error = new Error(`${label} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
		for (const entry of pending.values()) {
			clearTimeout(entry.timeoutId);
			entry.reject(error);
		}
		pending.clear();
	});

	return {
		close() {
			child.kill();
		},
		send(commandName, payload) {
			const id = (nextId += 1);
			const promise = new Promise((resolve, reject) => {
				const timeoutId = setTimeout(() => {
					pending.delete(id);
					reject(new Error(`conductor-rs command timed out: ${commandName}`));
				}, 120000);
				pending.set(id, { reject, resolve, timeoutId });
			});
			child.stdin.write(`${JSON.stringify({ command: commandName, id, ...payload })}\n`, "utf8");
			return promise;
		},
	};
};

const normalizeRustPoints = (value) =>
	(Array.isArray(value) ? value : [])
		.filter((point) =>
			typeof point?.x === "number" &&
			Number.isFinite(point.x) &&
			typeof point?.y === "number" &&
			Number.isFinite(point.y)
		)
		.map((point) => ({
			x: point.x,
			y: point.y,
		}));

const sanitize = (value) => JSON.parse(JSON.stringify(value));

const normalizeSsFitResult = (value) => ({
	strict: normalizeSsFit(value?.strict),
	suggested: normalizeSsFit(value?.suggested),
});

const normalizeSsFit = (value) => ({
	ok: value?.ok === true,
	ss: value?.ss ?? null,
	x1: value?.x1 ?? null,
	x2: value?.x2 ?? null,
});

const numericClose = (left, right) => {
	const difference = Math.abs(left - right);
	const scale = Math.max(1, Math.abs(left), Math.abs(right));
	return difference <= 1e-8 || difference / scale <= 1e-8;
};

const compareValues = (expected, actual, valuePath = "") => {
	const failures = [];
	if (typeof expected === "number" || typeof actual === "number") {
		if (
			typeof expected !== "number" ||
			typeof actual !== "number" ||
			!numericClose(expected, actual)
		) {
			failures.push({ actual, expected, path: valuePath });
		}
		return failures;
	}
	if (Array.isArray(expected) || Array.isArray(actual)) {
		if (!Array.isArray(expected) || !Array.isArray(actual)) {
			return [{ actual, expected, path: valuePath }];
		}
		if (expected.length !== actual.length) {
			failures.push({
				actual: actual.length,
				expected: expected.length,
				path: `${valuePath}.length`,
			});
		}
		const count = Math.min(expected.length, actual.length);
		for (let index = 0; index < count; index += 1) {
			failures.push(
				...compareValues(expected[index], actual[index], `${valuePath}[${index}]`),
			);
		}
		return failures;
	}
	if (
		expected &&
		actual &&
		typeof expected === "object" &&
		typeof actual === "object"
	) {
		const keys = Array.from(new Set([
			...Object.keys(expected),
			...Object.keys(actual),
		])).sort();
		for (const key of keys) {
			failures.push(
				...compareValues(
					expected[key],
					actual[key],
					valuePath ? `${valuePath}.${key}` : key,
				),
			);
		}
		return failures;
	}
	if (!Object.is(expected, actual)) {
		failures.push({ actual, expected, path: valuePath });
	}
	return failures;
};

const main = async () => {
	await fs.rm(OUTPUT_DIR, { force: true, recursive: true });
	await fs.mkdir(OUTPUT_DIR, { recursive: true });

	const workerCommand = await resolveWorkerCommand();
	const worker = createWorker(workerCommand);
	const summaries = [];
	try {
		for (const fixture of fixtures) {
			const seriesId = `${fixture.fileId}:series`;
			const result = await worker.send("analyzeSeriesBatch", {
				fileId: fixture.fileId,
				series: [{
					id: seriesId,
					x: fixture.points.map((point) => point.x),
					y: fixture.points.map((point) => point.y),
				}],
				sourceFile: fixture.sourceFile,
			});
			const rustAnalysis = result?.series?.[seriesId] ?? {};
			const expected = {
				baseCurrent: computeBaseCurrentMetrics({
					points: fixture.points,
					sourceFile: fixture.sourceFile,
				}),
				gm: calculateGmPoints(fixture.points),
				...(fixture.sourceFile.supportsSs ? {
					ss: calculateSsPoints(fixture.points),
					ssFitAuto: normalizeSsFitResult(
						computeSubthresholdSwingFitAuto(fixture.points),
					),
				} : {}),
			};
			const actual = {
				baseCurrent: rustAnalysis.baseCurrent,
				gm: normalizeRustPoints(rustAnalysis.gm),
				...(fixture.sourceFile.supportsSs ? {
					ss: normalizeRustPoints(rustAnalysis.ss),
					ssFitAuto: normalizeSsFitResult(rustAnalysis.ssFitAuto),
				} : {}),
			};
			const failures = compareValues(
				sanitize(expected),
				sanitize(actual),
			);
			summaries.push({
				failures,
				fixture: fixture.fileId,
				passed: failures.length === 0,
				pointCount: fixture.points.length,
			});
		}
	} finally {
		worker.close();
	}

	const failures = summaries.filter((summary) => !summary.passed);
	await fs.writeFile(REPORT_PATH, JSON.stringify({
		checked: summaries.length,
		failures,
		generatedAt: new Date().toISOString(),
		summaries,
		worker: workerCommand.label,
	}, null, 2));

	if (failures.length) {
		for (const failure of failures) {
			console.error(`[${REPORT_TAG}] FAIL ${failure.fixture}`);
			for (const mismatch of failure.failures.slice(0, 20)) {
				console.error(
					`  ${mismatch.path}: expected=${JSON.stringify(mismatch.expected)} actual=${JSON.stringify(mismatch.actual)}`,
				);
			}
		}
		console.error(`[${REPORT_TAG}] report=${REPORT_PATH}`);
		process.exit(1);
	}

	console.log(`[${REPORT_TAG}] all ${summaries.length} fixtures matched`);
	console.log(`[${REPORT_TAG}] report=${REPORT_PATH}`);
};

main().catch((error) => {
	console.error(`[${REPORT_TAG}] ${error?.message || error}`);
	process.exit(1);
});
