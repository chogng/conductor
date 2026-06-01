import {
  ImportSessionViewlet,
  type ImportSessionViewletProps,
} from "src/cs/workbench/contrib/import/browser/importSessionViewlet";

export class ImportSessionViewletHost {
  public readonly element: HTMLDivElement;
  private readonly view: ImportSessionViewlet;

  constructor(props: ImportSessionViewletProps) {
    this.element = document.createElement("div");
    this.element.className = "import-session-viewlet-host-root";
    this.view = new ImportSessionViewlet(this.element, props);
  }

  public update(props: ImportSessionViewletProps): void {
    this.view.setProps(props);
  }

  public dispose(): void {
    this.view.dispose();
  }
}
