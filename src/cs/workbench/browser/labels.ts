import "src/cs/base/browser/ui/iconLabel/iconLabelStyles";

import {
  IconLabel,
  type IIconLabelCreationOptions,
  type IIconLabelValueOptions,
} from "src/cs/base/browser/ui/iconLabel/iconLabel";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import {
  FileKind,
  getIconClasses,
} from "src/cs/workbench/contrib/files/common/getIconClasses";

export type ResourceLabelProps = {
  readonly name?: string;
  readonly resource?: string | null;
};

export type ResourceLabelOptions = IIconLabelValueOptions & {
  readonly fileKind?: FileKind;
};

export interface IResourceLabel extends IDisposable {
  readonly element: HTMLElement;
  setLabel(label?: string, options?: IIconLabelValueOptions): void;
  setResource(label: ResourceLabelProps, options?: ResourceLabelOptions): void;
  clear(): void;
}

export class ResourceLabels implements IDisposable {
  private readonly labels = new Set<IResourceLabel>();

  create(container: HTMLElement, options?: IIconLabelCreationOptions): IResourceLabel {
    const label = new ResourceLabel(container, options);
    this.labels.add(label);
    return {
      element: label.element,
      setLabel: (value, labelOptions) => label.setLabel(value, labelOptions),
      setResource: (value, labelOptions) => label.setResource(value, labelOptions),
      clear: () => label.clear(),
      dispose: () => {
        this.labels.delete(label);
        label.dispose();
      },
    };
  }

  dispose(): void {
    for (const label of this.labels) {
      label.dispose();
    }
    this.labels.clear();
  }
}

export class ResourceLabel implements IResourceLabel {
  private readonly label: IconLabel;
  private readonly disposables = new DisposableStore();

  constructor(container: HTMLElement, options?: IIconLabelCreationOptions) {
    this.label = this.disposables.add(new IconLabel(container, options));
  }

  get element(): HTMLElement {
    return this.label.element;
  }

  setLabel(label = "", options?: IIconLabelValueOptions): void {
    this.label.setLabel(label, options);
  }

  setResource(
    label: ResourceLabelProps,
    options: ResourceLabelOptions = {},
  ): void {
    const name = label.name ?? getResourceName(label.resource);
    const resource = label.resource ?? name;
    const fileKind = options.fileKind ?? FileKind.FILE;
    const iconClasses = getIconClasses(resource, fileKind);
    this.label.setLabel(name, {
      ...options,
      extraClasses: [
        ...iconClasses,
        ...(options.extraClasses ?? []),
      ],
      icon: options.icon ?? getResourceIcon(iconClasses, fileKind),
    });
  }

  clear(): void {
    this.label.clear();
  }

  dispose(): void {
    this.disposables.dispose();
  }
}

const getResourceName = (resource: string | null | undefined): string => {
  const normalized = String(resource ?? "").replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
};

const getResourceIcon = (
  iconClasses: readonly string[],
  fileKind: FileKind,
): LxIconDefinition | undefined => {
  if (fileKind !== FileKind.FILE) {
    return undefined;
  }

  return iconClasses.some((className) =>
    className === "xls-ext-file-icon" || className === "xlsx-ext-file-icon"
  )
    ? LxIcon.xlsGreen
    : LxIcon.csvGreen;
};
