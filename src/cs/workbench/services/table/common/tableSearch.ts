/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TableCellSearchQuery } from "src/cs/workbench/services/table/common/table";

export type TableCellMatcherResult =
	| { readonly kind: "empty" }
	| {
		readonly kind: "invalidPattern";
		readonly message: string;
	}
	| {
		readonly kind: "ok";
		readonly matches: (value: string) => boolean;
	};

export const createTableCellMatcher = (
	query: TableCellSearchQuery,
): TableCellMatcherResult => {
	const pattern = String(query.pattern ?? "");
	if (!pattern) {
		return { kind: "empty" };
	}

	const matchWholeCell = query.matchWholeCell === true;
	const isCaseSensitive = query.isCaseSensitive === true;
	if (query.isRegExp === true) {
		let expression: RegExp;
		try {
			expression = new RegExp(pattern, isCaseSensitive ? "" : "i");
		} catch (error) {
			return {
				kind: "invalidPattern",
				message: getErrorMessage(error),
			};
		}

		return {
			kind: "ok",
			matches: value => {
				const match = expression.exec(value);
				return matchWholeCell
					? match !== null && match.index === 0 && match[0].length === value.length
					: match !== null;
			},
		};
	}

	const needle = isCaseSensitive ? pattern : pattern.toLowerCase();
	return {
		kind: "ok",
		matches: value => {
			const candidate = isCaseSensitive ? value : value.toLowerCase();
			return matchWholeCell
				? candidate === needle
				: candidate.includes(needle);
		},
	};
};

const getErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
