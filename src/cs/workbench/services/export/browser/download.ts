/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const triggerBlobDownload = (
	filename: string,
	blob: Blob,
): void => {
	const url = URL.createObjectURL(blob);
	const downloadAnchorNode = document.createElement("a");

	downloadAnchorNode.setAttribute("href", url);
	downloadAnchorNode.setAttribute("download", filename);

	document.body.appendChild(downloadAnchorNode);
	downloadAnchorNode.click();
	downloadAnchorNode.remove();

	URL.revokeObjectURL(url);
};
