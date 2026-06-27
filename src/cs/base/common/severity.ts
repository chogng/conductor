/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { equalsIgnoreCase } from "./strings";

enum Severity {
	Ignore = 0,
	Info = 1,
	Warning = 2,
	Error = 3,
}

namespace Severity {
	const error = "error";
	const warning = "warning";
	const warn = "warn";
	const info = "info";
	const ignore = "ignore";

	export function fromValue(value: string): Severity {
		if (!value) {
			return Severity.Ignore;
		}

		if (equalsIgnoreCase(error, value)) {
			return Severity.Error;
		}
		if (equalsIgnoreCase(warning, value) || equalsIgnoreCase(warn, value)) {
			return Severity.Warning;
		}
		if (equalsIgnoreCase(info, value)) {
			return Severity.Info;
		}
		return Severity.Ignore;
	}

	export function toString(severity: Severity): string {
		switch (severity) {
			case Severity.Error:
				return error;
			case Severity.Warning:
				return warning;
			case Severity.Info:
				return info;
			default:
				return ignore;
		}
	}
}

export default Severity;
