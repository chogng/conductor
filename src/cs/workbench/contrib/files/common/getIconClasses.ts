export const FileKind = {
  FILE: "file",
  FOLDER: "folder",
  ROOT_FOLDER: "rootFolder",
} as const;

export type FileKind = (typeof FileKind)[keyof typeof FileKind];

const fileIconDirectoryRegex = /(?:\/|^)(?:([^/]+)\/)?([^/]+)$/;

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
