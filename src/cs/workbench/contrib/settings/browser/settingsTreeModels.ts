import type { SettingsTreeItem, SettingsTreeSection } from "src/cs/workbench/contrib/settings/browser/settingsTree";

export type SettingsTreeSectionOptions = Omit<SettingsTreeSection, "items">;

export abstract class SettingsTreeElement {
  public parent: SettingsTreeElement | null = null;

  protected constructor(public readonly id: string) {}

  protected attachTo(parent: SettingsTreeElement): void {
    this.parent = parent;
  }
}

export class SettingsTreeRootElement extends SettingsTreeElement {
  private readonly sectionElements: SettingsTreeSectionElement[] = [];

  constructor(
    id: string,
    public readonly title: string,
  ) {
    super(id);
  }

  public get children(): readonly SettingsTreeSectionElement[] {
    return this.sectionElements;
  }

  public appendSection(section: SettingsTreeSectionOptions): SettingsTreeSectionElement {
    const element = new SettingsTreeSectionElement(section);
    element.attachToRoot(this);
    this.sectionElements.push(element);
    return element;
  }
}

export class SettingsTreeSectionElement extends SettingsTreeElement {
  private readonly itemElements: SettingsTreeItemElement[] = [];

  constructor(private readonly options: SettingsTreeSectionOptions) {
    super(options.id);
  }

  public get children(): readonly SettingsTreeItemElement[] {
    return this.itemElements;
  }

  public attachToRoot(parent: SettingsTreeRootElement): void {
    this.attachTo(parent);
  }

  public appendItem(item: SettingsTreeItem): SettingsTreeItemElement {
    const element = new SettingsTreeItemElement(item);
    element.attachToSection(this);
    this.itemElements.push(element);
    return element;
  }

  public toSection(): SettingsTreeSection {
    return {
      ...this.options,
      items: this.itemElements.map(element => element.item),
    };
  }
}

export class SettingsTreeItemElement extends SettingsTreeElement {
  constructor(public readonly item: SettingsTreeItem) {
    super(item.id);
  }

  public attachToSection(parent: SettingsTreeSectionElement): void {
    this.attachTo(parent);
  }
}

export class SettingsTreeModel {
  public readonly root: SettingsTreeRootElement;
  private readonly sectionsById = new Map<string, SettingsTreeSectionElement>();

  constructor(options: { readonly id: string; readonly title: string }) {
    this.root = new SettingsTreeRootElement(options.id, options.title);
  }

  public addItemToSection(section: SettingsTreeSectionOptions, item: SettingsTreeItem): SettingsTreeItemElement {
    return this.getOrCreateSection(section).appendItem(item);
  }

  public toSections(): readonly SettingsTreeSection[] {
    return this.root.children.map(section => section.toSection());
  }

  private getOrCreateSection(section: SettingsTreeSectionOptions): SettingsTreeSectionElement {
    const existing = this.sectionsById.get(section.id);
    if (existing) {
      return existing;
    }

    const element = this.root.appendSection(section);
    this.sectionsById.set(section.id, element);
    return element;
  }
}
