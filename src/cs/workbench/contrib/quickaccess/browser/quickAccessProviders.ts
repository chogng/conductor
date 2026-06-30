import { localize } from "src/cs/nls";
import { PickerQuickAccessProvider } from "src/cs/platform/quickinput/browser/pickerQuickAccess";
import type { QuickAccessItem } from "src/cs/platform/quickinput/common/quickAccess";
import { IQuickInputService } from "src/cs/platform/quickinput/common/quickInput";
import {
  IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  getExplorerFileResourceIdentity,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { COMMANDS_QUICK_ACCESS_PREFIX } from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";

export const FILES_QUICK_ACCESS_PREFIX = "file ";

export class DefaultQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessItem> {
  public constructor(
    @IQuickInputService private readonly quickInputService: IQuickInputService,
  ) {
    super();
  }

  protected getPicks(): readonly QuickAccessItem[] {
    return [
      {
        accept: () => this.quickInputService.quickAccess.show(FILES_QUICK_ACCESS_PREFIX),
        description: localize("quickAccess.files.description", "Switch the active workbench file"),
        id: "quickAccess.gotoFiles",
        label: localize("quickAccess.files.label", "Go to File"),
      },
      {
        accept: () => this.quickInputService.quickAccess.show(COMMANDS_QUICK_ACCESS_PREFIX),
        description: localize("quickAccess.commands.description", "Search available commands"),
        id: "quickAccess.gotoCommands",
        label: localize("quickAccess.commands.label", "Go to Commands"),
      },
    ];
  }
}

export class FilesQuickAccessProvider extends PickerQuickAccessProvider<QuickAccessItem> {
  public constructor(
    @IExplorerService private readonly explorerService: IExplorerService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
  ) {
    super(FILES_QUICK_ACCESS_PREFIX);
  }

  protected getPicks(filter: string): readonly QuickAccessItem[] {
    const paneInput = this.explorerService.getPaneInput();
    const selectionKind = this.layoutService.activeWorkbenchMainPart;
    if (!paneInput || paneInput.selectionKind !== selectionKind) {
      return [];
    }

    const files = this.explorerService.files;
    const normalizedFilter = filter.trim().toLowerCase();
    return files
      .map(file => {
        const fileId = normalizeFileId(file.fileId);
        const target = getExplorerFileResourceIdentity(file);
        if (!fileId || !target) {
          return null;
        }

        const label = String(file.fileName ?? fileId).trim() || fileId;
        const item: QuickAccessItem = {
          accept: () => {
            this.explorerService.select(target.resource, "force", target.sheetId ?? null);
          },
          description: getFileDescription(file),
          id: fileId,
          label,
        };
        return item;
      })
      .filter((item): item is QuickAccessItem => Boolean(item))
      .filter(item => !normalizedFilter || `${item.label} ${item.description ?? ""} ${item.id}`.toLowerCase().includes(normalizedFilter));
  }
}

const normalizeFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const getFileDescription = (
  file: ExplorerFileEntry,
): string | undefined => {
  const path = getFirstNonEmptyText(
    file.relativePath,
    file.sourcePath,
    file.normalizedCsvPath,
  );
  const directoryPath = getDirectoryPath(path, String(file.fileName ?? file.fileId ?? ""));
  return directoryPath || undefined;
};

const getDirectoryPath = (
  path: string,
  fileName: string,
): string => {
  const normalizedPath = normalizePathText(path);
  if (!normalizedPath) {
    return "";
  }

  const normalizedFileName = normalizePathText(fileName);
  if (
    normalizedFileName &&
    normalizedPath.toLowerCase().endsWith(`/${normalizedFileName.toLowerCase()}`)
  ) {
    return normalizedPath.slice(0, -normalizedFileName.length - 1);
  }

  if (normalizedPath === normalizedFileName) {
    return "";
  }

  return normalizedPath;
};

const getFirstNonEmptyText = (
  ...values: readonly unknown[]
): string => {
  for (const value of values) {
    const text = normalizePathText(value);
    if (text) {
      return text;
    }
  }

  return "";
};

const normalizePathText = (
  value: unknown,
): string =>
  String(value ?? "")
    .trim()
    .replace(/\\/g, "/");
