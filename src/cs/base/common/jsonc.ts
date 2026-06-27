/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const jsoncTokenPattern = /("[^"\\]*(?:\\.[^"\\]*)*")|('[^'\\]*(?:\\.[^'\\]*)*')|(\/\*[^/*]*(?:(?:\*|\/)[^/*]*)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))|(,\s*[}\]])/g;

function asWhitespace(value: string): string {
	return value.replace(/[^\r\n]/g, " ");
}

export function stripComments(content: string): string {
	return content.replace(
		jsoncTokenPattern,
		(match, _doubleQuoted, _singleQuoted, blockComment, lineComment, trailingComma) => {
			if (blockComment) {
				return asWhitespace(match);
			}
			if (lineComment) {
				if (lineComment.endsWith("\r\n")) {
					return `${asWhitespace(match.slice(0, -2))}\r\n`;
				}
				if (lineComment.endsWith("\n")) {
					return `${asWhitespace(match.slice(0, -1))}\n`;
				}
				return asWhitespace(match);
			}
			if (trailingComma) {
				return match.substring(1);
			}
			return match;
		},
	);
}

export function parse<T = unknown>(content: string): T {
	return JSON.parse(stripComments(content)) as T;
}
