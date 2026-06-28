import { addDisposableListener } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { Mimes } from "src/cs/base/common/mime";

// Browser DOM drag/drop MIME keys. Keep these in browser because they are
// written to native DataTransfer objects; common/dataTransfer owns
// VSDataTransfer only.
export const DataTransfers = {
    RESOURCES: "ResourceURLs",
    DOWNLOAD_URL: "DownloadURL",
    FILES: "Files",
    TEXT: Mimes.text,
    INTERNAL_URI_LIST: "application/vnd.code.uri-list",
} as const;

export interface IDragAndDropData {
    update(dataTransfer: DataTransfer): void;
    getData(): unknown;
}

export class DelayedDragHandler extends Disposable {
    private timeout: ReturnType<typeof setTimeout> | undefined;

    constructor(container: HTMLElement, callback: () => void) {
        super();

        this._register(addDisposableListener(container, "dragover", event => {
            event.preventDefault();

            if (!this.timeout) {
                this.timeout = setTimeout(() => {
                    callback();
                    this.timeout = undefined;
                }, 800);
            }
        }));

        for (const type of ["dragleave", "drop", "dragend"] as const) {
            this._register(addDisposableListener(container, type, () => {
                this.clearDragTimeout();
            }));
        }
    }

    private clearDragTimeout(): void {
        if (!this.timeout) {
            return;
        }

        clearTimeout(this.timeout);
        this.timeout = undefined;
    }

    public override dispose(): void {
        super.dispose();
        this.clearDragTimeout();
    }
}
