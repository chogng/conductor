import { localize } from "src/cs/nls";
import { createMenuAction } from "src/cs/base/browser/ui/menu/menu";
import { toAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { WorkbenchSidebarAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  FilesPane,
  type FilesPaneProps,
} from "src/cs/workbench/contrib/files/browser/filesPane";
import {
  ADD_FOLDER_ACTION_ID,
  FilesViewId,
  MORE_ACTIONS_ACTION_ID,
  REMOVE_FOLDER_ACTION_ID,
  TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
} from "src/cs/workbench/contrib/files/common/files";
import type { TemplateSelection } from "src/cs/workbench/contrib/template/common/templateSelection";

export class FilesPaneHost extends ViewPane {
  private readonly host: HTMLDivElement;
  private readonly view: FilesPane;
  private props: FilesPaneProps;

  constructor(props: FilesPaneProps) {
    super({
      id: FilesViewId,
      title: localize("files.explorerSection", "Explorer"),
      className: "files-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.props = props;
    this.host = document.createElement("div");
    this.host.className = "files-pane-root";
    this.view = new FilesPane(this.host, props);
    this.body.append(this.host);
  }

  public update(props: FilesPaneProps): void {
    this.props = props;
    this.view.setProps(props);
    if (
      this.element.isConnected &&
      this.element.clientHeight > 0 &&
      this.element.clientWidth > 0
    ) {
      this.layout(this.element.clientHeight, this.element.clientWidth);
    }
  }

  public dispose(): void {
    this.view.dispose();
    super.dispose();
  }

  public removeFile(fileId: string): void {
    this.view.removeFile(fileId);
  }

  protected override layoutBody(height: number, width: number): void {
    this.body.style.height = `${height}px`;
    this.body.style.width = `${width}px`;
    this.host.style.height = `${height}px`;
    this.host.style.width = `${width}px`;
    this.view.layout(height, width);
  }

  public getActions(): readonly WorkbenchSidebarAction[] {
    return [
      {
        ...toAction({
          id: MORE_ACTIONS_ACTION_ID,
          label: localize("files.moreActions", "More Actions"),
          tooltip: localize("files.moreActions", "More Actions"),
          class: "sidebar_header_action",
          run: (event) => this.showMoreActions(getActionAnchor(event), this.props),
        }),
        icon: LxIcon.moreHorizontal,
      } satisfies WorkbenchSidebarAction,
    ];
  }

  private showMoreActions(anchor: HTMLElement, props: FilesPaneProps): void {
    const canRemoveFolder = hasFolder(props.files);
    const isThumbnailView = props.viewMode === "thumbnail";
    props.contextMenuService.showContextMenu({
      autoSelectFirstItem: true,
      getAnchor: () => anchor,
      getActions: () => [
        createMenuAction({
          checked: isThumbnailView,
          id: TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
          label: localize("files.thumbnailView", "Thumbnail"),
          run: () => {
            void props.commandService.executeCommand(TOGGLE_THUMBNAIL_VIEW_ACTION_ID);
          },
        }),
        createMenuAction({
          icon: LxIcon.add,
          id: ADD_FOLDER_ACTION_ID,
          label: localize("files.addFolder", "Add Folder"),
          run: () => this.view.openFileDialog(),
        }),
        createMenuAction({
          enabled: canRemoveFolder,
          icon: LxIcon.remove,
          id: REMOVE_FOLDER_ACTION_ID,
          label: localize("files.removeFolder", "Remove Folder"),
          run: () => this.view.removeSelectedFolder(),
        }),
      ],
    });
  }

  public setFileTemplateSelection(fileId: string, selection: TemplateSelection): void {
    this.view.setFileTemplateSelection(fileId, selection);
  }
}

function getActionAnchor(event: unknown): HTMLElement {
  if (
    event instanceof MouseEvent &&
    event.currentTarget instanceof HTMLElement
  ) {
    return event.currentTarget;
  }
  return document.body;
}

function hasFolder(files: FilesPaneProps["files"]): boolean {
  return Array.isArray(files) && files.some(file => {
    const relativePath = String(file.relativePath ?? "");
    return relativePath.includes("/");
  });
}
