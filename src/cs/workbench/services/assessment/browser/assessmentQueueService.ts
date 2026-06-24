/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
	getRawTableRefsForTableFactsEvent,
	RawTableFactsQueueService,
} from "src/cs/workbench/services/tableFacts/browser/rawTableFactsQueueService";

import {
	getRawTableRefsForTableFactsEvent,
	RawTableFactsQueueService,
} from "src/cs/workbench/services/tableFacts/browser/rawTableFactsQueueService";

export const AssessmentQueueService = RawTableFactsQueueService;
export const getRawTableRefsForAssessmentEvent = getRawTableRefsForTableFactsEvent;
