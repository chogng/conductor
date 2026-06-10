/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { buildTemplateProcessingQueue } from "src/cs/workbench/services/template/browser/templateApplyPlanner";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";

suite("workbench/services/template/test/browser/templateApplyPlanner", () => {
	test("buildTemplateProcessingQueue filters invalid, duplicate, and processed files", () => {
		const files: SessionFile[] = [
			{
				file: {},
				fileId: " file-a ",
				fileName: "A.csv",
				normalizedCsvPath: "C:/tmp/a.csv",
				sourcePath: "C:/source/a.csv",
			},
			{
				file: {},
				fileId: "file-a",
				fileName: "Duplicate.csv",
			},
			{
				file: {},
				fileId: "file-b",
				fileName: "B.csv",
			},
			{
				fileId: "file-c",
				fileName: "Missing file.csv",
			},
			{
				file: {},
				fileId: "file-d",
				fileName: "Processed.csv",
			},
		];

		assert.deepEqual(
			buildTemplateProcessingQueue(files, new Set(["file-d"])),
			[
				{
					file: files[0].file,
					fileId: "file-a",
					fileName: "A.csv",
					normalizedCsvPath: "C:/tmp/a.csv",
					sourcePath: "C:/source/a.csv",
				},
				{
					file: files[2].file,
					fileId: "file-b",
					fileName: "B.csv",
					normalizedCsvPath: null,
					sourcePath: null,
				},
			],
		);
	});
});
