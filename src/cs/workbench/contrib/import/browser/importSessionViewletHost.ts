import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import {
  ImportSessionViewlet,
  type ImportSessionViewletProps,
} from "src/cs/workbench/contrib/import/browser/importSessionViewlet";

export class ImportSessionViewletHost {
  public readonly element: HTMLElement;
  private readonly host: HTMLDivElement;
  private readonly sidebarPart: SidebarPart;
  private readonly view: ImportSessionViewlet;

  constructor(props: ImportSessionViewletProps) {
    this.host = document.createElement("div");
    this.host.className = "import-session-viewlet-host-root";
    this.view = new ImportSessionViewlet(this.host, props);
    this.sidebarPart = new SidebarPart(this.getSidebarOptions(props));
    this.element = this.sidebarPart.element;
  }

  public update(props: ImportSessionViewletProps): void {
    this.view.setProps(props);
    this.sidebarPart.update(this.getSidebarOptions(props));
  }

  public dispose(): void {
    this.view.dispose();
    this.sidebarPart.dispose();
  }

  private getSidebarOptions(props: ImportSessionViewletProps) {
    return {
      ariaLabel: props.t("files.importSection"),
      children: this.host,
      className: "import-session-sidebar_part",
      title: props.t("files.importSection"),
    };
  }
}
