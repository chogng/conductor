/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from "src/cs/platform/actions/common/actions";
import {
	RunSliceWithTemplateAction,
	RunSliceWithTemplateIncrementalAction,
} from "src/cs/workbench/contrib/slice/browser/sliceActions";

registerAction2(RunSliceWithTemplateAction);
registerAction2(RunSliceWithTemplateIncrementalAction);
