import { localize } from "src/cs/nls";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import {
  FilesPane,
  type FilesPaneProps,
} from "src/cs/workbench/contrib/files/browser/filesPane";

export class FilesPaneHost {
  public readonly element: HTMLElement;
  private readonly host: HTMLDivElement;
  private readonly sidebarPart: SidebarPart;
  private readonly view: FilesPane;

  constructor(props: FilesPaneProps) {
    this.host = document.createElement("div");
    this.host.className = "files-pane-root";
    this.view = new FilesPane(this.host, props);
    this.sidebarPart = new SidebarPart(this.getSidebarOptions(props));
    this.element = this.sidebarPart.element;
  }

  public update(props: FilesPaneProps): void {
    this.view.setProps(props);
    this.sidebarPart.update(this.getSidebarOptions(props));
  }

  public dispose(): void {
    this.view.dispose();
    this.sidebarPart.dispose();
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
