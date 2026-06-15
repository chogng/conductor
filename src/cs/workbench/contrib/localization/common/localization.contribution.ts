/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import type { IWorkbenchContribution } from "src/cs/workbench/common/contributions";
import { registerLocalizationCommands } from "src/cs/workbench/contrib/localization/common/localizationsActions";

export class BaseLocalizationWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	public constructor() {
		super();
		this._register(registerLocalizationCommands());
	}
}
