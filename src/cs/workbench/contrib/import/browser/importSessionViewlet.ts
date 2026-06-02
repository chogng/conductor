import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import {
  ImportSessionController,
  type ImportSessionFileInfo,
  type ImportSessionRef,
} from "src/cs/workbench/contrib/import/browser/importSessionController";
import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";

import "src/cs/workbench/contrib/import/browser/media/importSessionViewlet.css";

export type ImportSessionViewletProps = {
  readonly dialogsService: IFileDialogService;
  readonly filesService: IFileService;
  readonly pathService: IPathService;
  readonly importSessionRef: { current: ImportSessionRef | null };
  readonly files?: FileEntry[];
  readonly onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  readonly onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  readonly onFileRemoved?: (fileId: string) => void;
  readonly onFileSelected?: (fileId: string | null) => void;
  readonly selectedFileId?: string | null;
  readonly t: TranslateFn;
};

export class ImportSessionViewlet implements IDisposable {
  private readonly host: HTMLElement;
  private readonly body: HTMLDivElement;
  private readonly sessionHost: HTMLDivElement;
  private readonly sessionController: ImportSessionController;
  private props: ImportSessionViewletProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ImportSessionViewletProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("import-session-viewlet-host");

    const { body, sessionHost } = this.createDom();
    this.body = body;
    this.sessionHost = sessionHost;
    this.host.appendChild(this.body);

    this.sessionController = new ImportSessionController(this.sessionHost, {
      dialogsService: props.dialogsService,
      files: props.files,
      filesService: props.filesService,
      pathService: props.pathService,
      onFileImported: props.onFileImported,
      onFilesReplaced: props.onFilesReplaced,
      onFileRemoved: props.onFileRemoved,
      onFileSelected: props.onFileSelected,
      selectedFileId: props.selectedFileId,
      t: props.t,
    });

    props.importSessionRef.current = this.sessionController;
    this.render();
  }

  setProps(nextProps: ImportSessionViewletProps): void {
    this.props = nextProps;
    nextProps.importSessionRef.current = this.sessionController;
    this.sessionController.setProps({
      dialogsService: nextProps.dialogsService,
      files: nextProps.files,
      filesService: nextProps.filesService,
      pathService: nextProps.pathService,
      onFileImported: nextProps.onFileImported,
      onFilesReplaced: nextProps.onFilesReplaced,
      onFileRemoved: nextProps.onFileRemoved,
      onFileSelected: nextProps.onFileSelected,
      selectedFileId: nextProps.selectedFileId,
      t: nextProps.t,
    });
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.props.importSessionRef.current === this.sessionController) {
      this.props.importSessionRef.current = null;
    }
    this.sessionController.dispose();
    this.host.classList.remove("import-session-viewlet-host");
    this.body.remove();
  }

  private render(): void {
    if (this.disposed) {
      return;
    }
  }

  private createDom(): {
    readonly body: HTMLDivElement;
    readonly sessionHost: HTMLDivElement;
  } {
    const body = document.createElement("div");
    body.className = "import-session-viewlet-body";
    this.applyCardTracking(body);

    const sessionHost = document.createElement("div");
    sessionHost.className = "import-session-viewlet-session-host";

    body.append(sessionHost);

    return { body, sessionHost };
  }

  private applyCardTracking(body: HTMLDivElement): void {
    body.dataset.cta = normalizeCtaName("Device analysis") ?? "";
    body.dataset.ctaPosition = normalizeCtaToken("data-import") ?? "";
    body.dataset.ctaCopy = normalizeCtaToken("import session") ?? "";
  }
}
