import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import {
  FilesPane,
  type FilesPaneProps,
} from "src/cs/workbench/contrib/files/browser/filesPane";
import { FilesViewId } from "src/cs/workbench/contrib/files/common/files";

export class FilesPaneHost extends ViewPane {
  private readonly host: HTMLDivElement;
  private readonly sidebarPart: SidebarPart;
  private readonly view: FilesPane;

  constructor(props: FilesPaneProps) {
    super({
      id: FilesViewId,
      title: localize("files.explorerSection", "资源管理器"),
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
      ariaLabel: localize("files.explorerSection", "资源管理器"),
      children: this.host,
      className: "files-sidebar_part",
      title: localize("files.explorerSection", "资源管理器"),
    };
  }
}
