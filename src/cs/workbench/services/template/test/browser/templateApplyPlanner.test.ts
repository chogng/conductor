/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	buildTemplateProcessingPlan,
	buildTemplateProcessingQueue,
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
				file: {},
				fileId: "file-e",
				fileName: "Pending Assessment.csv",
			},
		];

		const plan = buildTemplateProcessingPlan(files);

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
					fileId: "file-e",
					reason: "missingAssessment",
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
