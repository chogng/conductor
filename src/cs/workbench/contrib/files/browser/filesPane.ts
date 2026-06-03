import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type { FileEntry, FilesPaneRef } from "src/cs/workbench/contrib/files/common/files";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  FilesController,
  type ImportSessionFileInfo,
} from "src/cs/workbench/contrib/files/browser/filesController";

import "src/cs/workbench/contrib/files/browser/views/media/filesPane.css";

export type FilesPaneProps = {
  readonly analysisFileService: IAnalysisFileService;
  readonly dialogsService: IFileDialogService;
  readonly filesService: IFileService;
  readonly pathService: IPathService;
  readonly filesPaneRef: { current: FilesPaneRef | null };
  readonly files?: FileEntry[];
  readonly cleanedData?: CleanedEntry[];
  readonly onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  readonly onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  readonly onFileRemoved?: (fileId: string) => void;
  readonly onFileSelected?: (fileId: string | null) => void;
  readonly selectedFileId?: string | null;
};

export class FilesPane implements IDisposable {
  private readonly host: HTMLElement;
  private readonly body: HTMLDivElement;
  private readonly sessionHost: HTMLDivElement;
  private readonly controller: FilesController;
  private props: FilesPaneProps;
  private disposed = false;

  constructor(host: HTMLElement, props: FilesPaneProps) {
    this.host = host;
    this.props = props;
    this.host.classList.add("files-pane");

    const { body, sessionHost } = this.createDom();
    this.body = body;
    this.sessionHost = sessionHost;
    this.host.appendChild(this.body);

    this.controller = new FilesController(this.sessionHost, {
      analysisFileService: props.analysisFileService,
      dialogsService: props.dialogsService,
      files: props.files,
      filesService: props.filesService,
      pathService: props.pathService,
      cleanedData: props.cleanedData,
      onFileImported: props.onFileImported,
      onFilesReplaced: props.onFilesReplaced,
      onFileRemoved: props.onFileRemoved,
      onFileSelected: props.onFileSelected,
      selectedFileId: props.selectedFileId,
    });

    props.filesPaneRef.current = this.controller;
  }

  setProps(nextProps: FilesPaneProps): void {
    this.props = nextProps;
    nextProps.filesPaneRef.current = this.controller;
    this.controller.setProps({
      analysisFileService: nextProps.analysisFileService,
      dialogsService: nextProps.dialogsService,
      files: nextProps.files,
      filesService: nextProps.filesService,
      pathService: nextProps.pathService,
      cleanedData: nextProps.cleanedData,
      onFileImported: nextProps.onFileImported,
      onFilesReplaced: nextProps.onFilesReplaced,
      onFileRemoved: nextProps.onFileRemoved,
      onFileSelected: nextProps.onFileSelected,
      selectedFileId: nextProps.selectedFileId,
    });
  }

  layout(height: number, width: number): void {
    const nextHeight = Math.max(0, height);
    const nextWidth = Math.max(0, width);
    this.body.style.height = `${nextHeight}px`;
    this.body.style.width = `${nextWidth}px`;
    this.sessionHost.style.height = `${nextHeight}px`;
    this.sessionHost.style.width = `${nextWidth}px`;
    this.controller.layout(nextHeight, nextWidth);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.props.filesPaneRef.current === this.controller) {
      this.props.filesPaneRef.current = null;
    }
    this.controller.dispose();
    this.host.classList.remove("files-pane");
    this.body.remove();
  }

  private createDom(): {
    readonly body: HTMLDivElement;
    readonly sessionHost: HTMLDivElement;
  } {
    const body = document.createElement("div");
    body.className = "files-pane-body";

    const sessionHost = document.createElement("div");
    sessionHost.className = "files-pane-session-host";

    body.append(sessionHost);

    return { body, sessionHost };
  }
}
