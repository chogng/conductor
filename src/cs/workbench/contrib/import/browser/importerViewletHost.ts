import {
  ImporterViewletView,
  type ImporterViewletProps,
} from "src/cs/workbench/contrib/import/browser/importerViewlet";

export class ImporterViewletHost {
  public readonly element: HTMLDivElement;
  private readonly view: ImporterViewletView;

  constructor(props: ImporterViewletProps) {
    this.element = document.createElement("div");
    this.element.className = "importer-viewlet-host-root";
    this.view = new ImporterViewletView(this.element, props);
  }

  public update(props: ImporterViewletProps): void {
    this.view.setProps(props);
  }

  public dispose(): void {
    this.view.dispose();
  }
}
