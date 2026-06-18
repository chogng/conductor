/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	buildTemplateProcessingPlan,
	buildTemplateProcessingQueue,
	prioritizeTemplateProcessingQueue,
} from "src/cs/workbench/services/template/browser/templateApplyPlanner";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/test/browser/templateApplyPlanner", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("buildTemplateProcessingQueue filters invalid, duplicate, and processed files", () => {
		const files: SessionFile[] = [
			{
				...createProcessableAssessment(),
				file: {},
				fileId: " file-a ",
				fileName: "A.csv",
				normalizedCsvPath: "C:/tmp/a.csv",
				sourcePath: "C:/source/a.csv",
			},
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-a",
				fileName: "Duplicate.csv",
			},
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-b",
				fileName: "B.csv",
			},
			{
				fileId: "file-c",
				fileName: "Missing file.csv",
			},
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-d",
				fileName: "Processed.csv",
			},
		];

		const queue = buildTemplateProcessingQueue(files, new Set(["file-d"]));
		assert.deepEqual(
			queue.map(entry => ({
				file: entry.file,
				fileId: entry.fileId,
				fileName: entry.fileName,
				normalizedCsvPath: entry.normalizedCsvPath,
				sourcePath: entry.sourcePath,
				assessment: entry.assessment?.curveType,
			})),
			[
				{
					file: files[0].file,
					fileId: "file-a",
					fileName: "A.csv",
					normalizedCsvPath: "C:/tmp/a.csv",
					sourcePath: "C:/source/a.csv",
					assessment: "transfer",
				},
				{
					file: files[2].file,
					fileId: "file-b",
					fileName: "B.csv",
					normalizedCsvPath: null,
					sourcePath: null,
					assessment: "transfer",
				},
			],
		);
	});

	test("prioritizeTemplateProcessingQueue keeps multiple priority ids in order", () => {
		const queue = [
			{ fileId: "file-a" },
			{ fileId: "file-b" },
			{ fileId: "file-c" },
			{ fileId: "file-d" },
		];

		assert.deepEqual(
			prioritizeTemplateProcessingQueue(queue, ["file-c", "file-b"])
				.map(entry => entry.fileId),
			["file-c", "file-b", "file-a", "file-d"],
		);
	});

	test("buildTemplateProcessingPlan skips files that need assessment or template review", () => {
		const files: SessionFile[] = [
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-a",
				fileName: "Ready.csv",
			},
			{
				...createProcessableAssessment({
					curveTypeNeedsTemplate: true,
				}),
				file: {},
				fileId: "file-b",
				fileName: "Needs Template.csv",
			},
			{
				...createProcessableAssessment({
					curveTypeConfidence: "low",
				}),
				file: {},
				fileId: "file-c",
				fileName: "Low Confidence.csv",
			},
			{
				...createProcessableAssessment({
					curveType: "unknown",
					curveTypeConfidence: "medium",
				}),
				file: {},
				fileId: "file-d",
				fileName: "Unknown.csv",
			},
			{
				...createProcessableAssessment(),
				assessmentHealth: "decodeFailed",
				file: {},
				fileId: "file-invalid",
				fileName: "Output_Vd.csv",
				templateEligibility: "notEligible",
			},
			{
				file: {},
				fileId: "file-e",
				fileName: "Pending Assessment.csv",
			},
		];

		const plan = buildTemplateProcessingPlan(files, null, {
			canProcessFile: true,
			canReadConvertedCsv: true,
		});

		assert.deepEqual(plan.queue.map(entry => entry.fileId), ["file-a"]);
		assert.deepEqual(
			plan.skippedFiles.map(file => ({
				fileId: file.fileId,
				reason: file.reason,
			})),
			[
				{
					fileId: "file-b",
					reason: "needsTemplate",
				},
				{
					fileId: "file-c",
					reason: "lowConfidence",
				},
				{
					fileId: "file-d",
					reason: "unknownCurveType",
				},
				{
					fileId: "file-invalid",
					reason: "invalidSource",
				},
				{
					fileId: "file-e",
					reason: "missingAssessment",
				},
			],
		);
	});

	test("buildTemplateProcessingPlan allows assessment-gated files for manual and rule modes", () => {
		const files: SessionFile[] = [
			{
				...createProcessableAssessment({
					curveTypeNeedsTemplate: true,
				}),
				file: {},
				fileId: "file-needs-template",
				fileName: "Needs Template.csv",
			},
			{
				...createProcessableAssessment({
					curveTypeConfidence: "low",
				}),
				file: {},
				fileId: "file-low-confidence",
				fileName: "Low Confidence.csv",
			},
			{
				...createProcessableAssessment({
					curveType: "unknown",
					curveTypeConfidence: "medium",
				}),
				file: {},
				fileId: "file-unknown",
				fileName: "Unknown.csv",
			},
			{
				file: {},
				fileId: "file-missing-assessment",
				fileName: "Pending Assessment.csv",
			},
			{
				...createProcessableAssessment(),
				assessmentHealth: "decodeFailed",
				file: {},
				fileId: "file-invalid",
				fileName: "Invalid.csv",
				templateEligibility: "notEligible",
			},
		];

		for (const mode of ["manual", "rule"] as const) {
			const plan = buildTemplateProcessingPlan(files, null, { mode });
			assert.deepEqual(plan.queue.map(entry => entry.fileId), [
				"file-needs-template",
				"file-low-confidence",
				"file-unknown",
				"file-missing-assessment",
			]);
			assert.deepEqual(
				plan.skippedFiles.map(file => ({
					fileId: file.fileId,
					reason: file.reason,
				})),
				[{
					fileId: "file-invalid",
					reason: "invalidSource",
				}],
			);
		}
	});

	test("buildTemplateProcessingPlan moves the active file to the front", () => {
		const files: SessionFile[] = [
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-a",
				fileName: "A.csv",
			},
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-b",
				fileName: "B.csv",
			},
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-c",
				fileName: "C.csv",
			},
		];

		const plan = buildTemplateProcessingPlan(files, null, {
			priorityFileId: " file-b ",
		});

		assert.deepEqual(plan.queue.map(entry => entry.fileId), [
			"file-b",
			"file-a",
			"file-c",
		]);
	});

	test("buildTemplateProcessingPlan queues converted csv sources without retained File objects", () => {
		const files: SessionFile[] = [
			{
				...createProcessableAssessment(),
				fileId: "file-normalized",
				fileName: "Normalized.csv",
				normalizedCsvPath: "C:/tmp/normalized.csv",
			},
			{
				...createProcessableAssessment(),
				fileId: "file-source",
				fileName: "Source.csv",
				sourcePath: "C:/source/source.csv",
			},
			{
				...createProcessableAssessment(),
				fileId: "file-missing-source",
				fileName: "Missing Source.csv",
			},
		];

		const plan = buildTemplateProcessingPlan(files, null, {
			canProcessFile: true,
			canReadConvertedCsv: true,
		});

		assert.deepEqual(
			plan.queue.map(entry => ({
				file: entry.file,
				fileId: entry.fileId,
				normalizedCsvPath: entry.normalizedCsvPath,
				sourcePath: entry.sourcePath,
			})),
			[
				{
					file: undefined,
					fileId: "file-normalized",
					normalizedCsvPath: "C:/tmp/normalized.csv",
					sourcePath: null,
				},
				{
					file: undefined,
					fileId: "file-source",
					normalizedCsvPath: null,
					sourcePath: "C:/source/source.csv",
				},
			],
		);
		assert.deepEqual(
			plan.skippedFiles.map(file => ({
				fileId: file.fileId,
				reason: file.reason,
			})),
			[{
				fileId: "file-missing-source",
				reason: "invalidSource",
			}],
		);
	});

	test("buildTemplateProcessingPlan skips path-only sources when the runtime cannot read them", () => {
		const files: SessionFile[] = [
			{
				...createProcessableAssessment(),
				fileId: "file-normalized",
				fileName: "Normalized.csv",
				normalizedCsvPath: "C:/tmp/normalized.csv",
			},
			{
				...createProcessableAssessment(),
				fileId: "file-source",
				fileName: "Source.csv",
				sourcePath: "C:/source/source.csv",
			},
			{
				...createProcessableAssessment(),
				file: {},
				fileId: "file-retained",
				fileName: "Retained.csv",
			},
		];

		const plan = buildTemplateProcessingPlan(files, null, {
			canProcessFile: false,
			canReadConvertedCsv: false,
		});

		assert.deepEqual(plan.queue.map(entry => entry.fileId), ["file-retained"]);
		assert.deepEqual(
			plan.skippedFiles.map(file => ({
				fileId: file.fileId,
				reason: file.reason,
			})),
			[
				{
					fileId: "file-normalized",
					reason: "invalidSource",
				},
				{
					fileId: "file-source",
					reason: "invalidSource",
				},
			],
		);
	});
});

const createProcessableAssessment = (
	overrides: Partial<SessionFile> = {},
): Partial<SessionFile> => ({
	curveType: "transfer",
	curveTypeConfidence: "high",
	curveTypeNeedsTemplate: false,
	xAxisRole: "vg",
	xAxisRoleSource: "metadata",
	...overrides,
});
