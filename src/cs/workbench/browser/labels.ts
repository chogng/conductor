/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import "../../base/browser/ui/iconLabel/iconLabelStyles.js";

import {
  IconLabel,
  type IIconLabelCreationOptions,
  type IIconLabelValueOptions,
} from "src/cs/base/browser/ui/iconLabel/iconLabel";
import { LxIcon } from "src/cs/base/common/lxicon";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type {
  IDecoration,
  IDecorationsService,
  IResourceDecorationChangeEvent,
} from "src/cs/workbench/services/decorations/common/decorations";

export const FileKind = {
  FILE: "file",
  FOLDER: "folder",
  ROOT_FOLDER: "rootFolder",
} as const;

export type FileKind = (typeof FileKind)[keyof typeof FileKind];

export type ResourceLabelProps = {
  readonly name?: string;
  readonly resource?: string | null;
};

export type ResourceLabelOptions = IIconLabelValueOptions & {
  readonly fileDecorations?: {
    readonly includeChildren?: boolean;
    readonly resource: URI;
  };
  readonly fileKind?: FileKind;
};

export interface IResourceLabel extends IDisposable {
  readonly element: HTMLElement;
  setLabel(label?: string, options?: IIconLabelValueOptions): void;
  setResource(label: ResourceLabelProps, options?: ResourceLabelOptions): void;
  notifyFileDecorationsChanges(event: IResourceDecorationChangeEvent): void;
  clear(): void;
}

export class ResourceLabels implements IDisposable {
  private readonly labels = new Set<IResourceLabel>();
  private readonly disposables = new DisposableStore();

  public constructor(
    private readonly decorationsService?: Pick<IDecorationsService, "getDecoration" | "onDidChangeDecorations">,
  ) {
    if (decorationsService) {
      this.disposables.add(decorationsService.onDidChangeDecorations(event => {
        for (const label of this.labels) {
          label.notifyFileDecorationsChanges(event);
        }
      }));
    }
  }

  create(container: HTMLElement, options?: IIconLabelCreationOptions): IResourceLabel {
    const label = new ResourceLabel(container, options, this.decorationsService);
    this.labels.add(label);
    return {
      element: label.element,
      setLabel: (value, labelOptions) => label.setLabel(value, labelOptions),
      setResource: (value, labelOptions) => label.setResource(value, labelOptions),
      notifyFileDecorationsChanges: event => label.notifyFileDecorationsChanges(event),
      clear: () => label.clear(),
      dispose: () => {
        this.labels.delete(label);
        label.dispose();
      },
    };
  }

  dispose(): void {
    this.disposables.dispose();
    for (const label of this.labels) {
      label.dispose();
    }
    this.labels.clear();
  }
}

export class ResourceLabel implements IResourceLabel {
  private readonly label: IconLabel;
  private readonly disposables = new DisposableStore();
  private currentDecoration: IDecoration | undefined;
  private currentLabel: ResourceLabelProps | null = null;
  private currentOptions: ResourceLabelOptions = {};

  constructor(
    container: HTMLElement,
    options?: IIconLabelCreationOptions,
    private readonly decorationsService?: Pick<IDecorationsService, "getDecoration">,
  ) {
    this.label = this.disposables.add(new IconLabel(container, options));
  }

  get element(): HTMLElement {
    return this.label.element;
  }

  setLabel(label = "", options?: IIconLabelValueOptions): void {
    this.currentLabel = null;
    this.currentOptions = {};
    this.clearDecoration();
    this.label.setLabel(label, options);
  }

  setResource(
    label: ResourceLabelProps,
    options: ResourceLabelOptions = {},
  ): void {
    this.currentLabel = label;
    this.currentOptions = options;
    this.renderResourceLabel(label, options);
  }

  notifyFileDecorationsChanges(event: IResourceDecorationChangeEvent): void {
    const decorationResource = this.currentOptions.fileDecorations?.resource;
    if (!this.currentLabel || !decorationResource || !event.affectsResource(decorationResource)) {
      return;
    }

    this.renderResourceLabel(this.currentLabel, this.currentOptions);
  }

  clear(): void {
    this.currentLabel = null;
    this.currentOptions = {};
    this.clearDecoration();
    this.label.clear();
  }

  dispose(): void {
    this.clearDecoration();
    this.disposables.dispose();
  }

  private renderResourceLabel(
    label: ResourceLabelProps,
    options: ResourceLabelOptions,
  ): void {
    const name = label.name ?? getResourceName(label.resource);
    const resource = label.resource ?? name;
    const fileKind = options.fileKind ?? FileKind.FILE;
    const resourceIcon = options.icon ?? getResourceIcon(resource, fileKind);
    const iconClasses = resourceIcon
      ? stripConflictingFileIconClasses(getIconClasses(resource, fileKind))
      : getIconClasses(resource, fileKind);
    const decoration = this.getDecoration(options);
    this.currentDecoration = decoration;
    this.label.setLabel(name, {
      ...options,
      extraClasses: [
        ...iconClasses,
        ...(decoration ? [
          decoration.labelClassName,
          decoration.badgeClassName,
          decoration.iconClassName,
        ] : []),
        ...(options.extraClasses ?? []),
      ],
      icon: resourceIcon,
      title: decoration?.tooltip || options.title,
    });

    this.applyDecoration(decoration);
  }

  private getDecoration(options: ResourceLabelOptions): IDecoration | undefined {
    this.clearDecoration();
    const fileDecorations = options.fileDecorations;
    if (!fileDecorations || !this.decorationsService) {
      return undefined;
    }
    return this.decorationsService.getDecoration(
      fileDecorations.resource,
      fileDecorations.includeChildren ?? false,
    );
  }

  private applyDecoration(decoration: IDecoration | undefined): void {
    const color = decoration ? getDecorationColor(decoration) : null;
    if (color) {
      this.element.dataset.decorationColor = color;
      this.element.style.color = color;
    } else {
      delete this.element.dataset.decorationColor;
      this.element.style.removeProperty("color");
    }

    if (decoration?.strikethrough) {
      this.element.dataset.decorationStrikethrough = "true";
      this.element.style.textDecoration = "line-through";
    } else {
      delete this.element.dataset.decorationStrikethrough;
      this.element.style.removeProperty("text-decoration");
    }
  }

  private clearDecoration(): void {
    this.currentDecoration?.dispose();
    this.currentDecoration = undefined;
    delete this.element.dataset.decorationColor;
    delete this.element.dataset.decorationStrikethrough;
    this.element.style.removeProperty("color");
    this.element.style.removeProperty("text-decoration");
  }
}

const getResourceName = (resource: string | null | undefined): string => {
  const normalized = String(resource ?? "").replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
};

const getResourceIcon = (
  resource: unknown,
  fileKind: FileKind = FileKind.FILE,
) => {
  if (fileKind !== FileKind.FILE) {
    return undefined;
  }

  const path = String(resource ?? "").replace(/\\/g, "/").toLowerCase();
  const fileName = getResourceName(path);
  const dotIndex = fileName.lastIndexOf(".");
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";

  if (extension === "csv") {
    return LxIcon.csvLetter;
  }

  if (extension === "xls" || extension === "xlsx") {
    return LxIcon.xlsLetter;
  }

  return undefined;
};

const stripConflictingFileIconClasses = (classes: readonly string[]): string[] =>
  classes.filter(className =>
    className !== "csv-ext-file-icon" &&
    className !== "xls-ext-file-icon" &&
    className !== "xlsx-ext-file-icon",
  );

const getDecorationColor = (decoration: IDecoration): string | null => {
  const color = decoration.data
    .map(item => String(item.color ?? "").trim())
    .find(Boolean);
  if (!color) {
    return null;
  }

  return color.startsWith("charts.")
    ? color.slice("charts.".length)
    : color;
};

export function getIconClasses(
  resource: unknown,
  fileKind: FileKind = FileKind.FILE,
): string[] {
  const classes =
    fileKind === FileKind.ROOT_FOLDER
      ? ["rootfolder-icon"]
      : fileKind === FileKind.FOLDER
        ? ["folder-icon"]
        : ["file-icon"];
  const path = String(resource ?? "").trim().replace(/\\/g, "/");
  if (!path) {
    return classes;
  }

  const match = path.match(fileIconDirectoryRegex);
  const parent = match?.[1];
  const rawName = match?.[2] ?? path;
  const name = fileIconSelectorEscape(rawName.toLowerCase());
  if (parent) {
    classes.push(`${fileIconSelectorEscape(parent.toLowerCase())}-name-dir-icon`);
  }

  if (fileKind === FileKind.ROOT_FOLDER) {
    classes.push(`${name}-root-name-folder-icon`);
    return classes;
  }

  if (fileKind === FileKind.FOLDER) {
    classes.push(`${name}-name-folder-icon`);
    return classes;
  }

  classes.push(`${name}-name-file-icon`, "name-file-icon");
  if (name.length <= 255) {
    const dotSegments = name.split(".");
    for (let index = 1; index < dotSegments.length; index += 1) {
      classes.push(`${dotSegments.slice(index).join(".")}-ext-file-icon`);
    }
  }
  classes.push("ext-file-icon");
  return classes;
}

export function fileIconSelectorEscape(value: string): string {
  return value.replace(/\s/g, "/");
}

const fileIconDirectoryRegex = /(?:\/|^)(?:([^/]+)\/)?([^/]+)$/;
