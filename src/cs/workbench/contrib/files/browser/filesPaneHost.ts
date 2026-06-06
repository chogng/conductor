import { localize } from "src/cs/nls";
import { createMenuAction } from "src/cs/base/browser/ui/menu/menu";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { WorkbenchSidebarAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import {
  FilesPane,
  type FilesPaneProps,
} from "src/cs/workbench/contrib/files/browser/filesPane";
import {
  ADD_FOLDER_ACTION_ID,
  FilesViewId,
  MORE_ACTIONS_ACTION_ID,
  REMOVE_FOLDER_ACTION_ID,
} from "src/cs/workbench/contrib/files/common/files";

export class FilesPaneHost extends ViewPane {
  private readonly host: HTMLDivElement;
  private readonly sidebarPart: SidebarPart;
  private readonly view: FilesPane;

  constructor(props: FilesPaneProps) {
    super({
      id: FilesViewId,
      title: localize("files.explorerSection", "Explorer"),
      className: "files-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.host = document.createElement("div");
    this.host.className = "files-pane-root";
    this.view = new FilesPane(this.host, props);
    this.sidebarPart = new SidebarPart(this.getSidebarOptions(props));
    this.body.append(this.sidebarPart.element);
  }

  public update(props: FilesPaneProps): void {
    this.view.setProps(props);
    this.sidebarPart.update(this.getSidebarOptions(props));
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
    this.sidebarPart.dispose();
    super.dispose();
  }

  protected override layoutBody(height: number, width: number): void {
    this.body.style.height = `${height}px`;
    this.body.style.width = `${width}px`;
    this.sidebarPart.element.style.height = `${height}px`;
    this.sidebarPart.element.style.width = `${width}px`;
    this.view.layout(height, width);
  }

  private getSidebarOptions(props: FilesPaneProps) {
    return {
      ariaLabel: localize("files.explorerSection", "Explorer"),
      children: this.host,
      className: "files-sidebar_part",
      headerActions: this.createHeaderActions(props),
      onAction: (action: WorkbenchSidebarAction, anchor: HTMLElement) =>
        this.handleSidebarAction(action, anchor, props),
      title: localize("files.explorerSection", "Explorer"),
    };
  }

  private createHeaderActions(_props: FilesPaneProps) {
    return [
      {
        id: MORE_ACTIONS_ACTION_ID,
        icon: LxIcon.moreHorizontal.render(),
        kind: "icon" as const,
        title: localize("files.moreActions", "More Actions"),
      },
    ];
  }

  private handleSidebarAction(
    action: WorkbenchSidebarAction,
    anchor: HTMLElement,
    props: FilesPaneProps,
  ): void {
    if (action.id === MORE_ACTIONS_ACTION_ID) {
      this.showMoreActions(anchor, props);
    }
  }

  private showMoreActions(anchor: HTMLElement, props: FilesPaneProps): void {
    const canRemoveFolder = hasFolder(props.files);
    props.contextMenuService.showContextMenu({
      autoSelectFirstItem: true,
      getAnchor: () => anchor,
      getActions: () => [
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
}

function hasFolder(files: FilesPaneProps["files"]): boolean {
  return Array.isArray(files) && files.some(file => {
    const relativePath = String(file.relativePath ?? "");
    return relativePath.includes("/");
  });
}
