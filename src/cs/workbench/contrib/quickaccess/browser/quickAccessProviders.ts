import { localize } from "src/cs/nls";
import { PickerQuickAccessProvider } from "src/cs/platform/quickinput/browser/pickerQuickAccess";
import type { QuickAccessItem } from "src/cs/platform/quickinput/common/quickAccess";
import { IQuickInputService } from "src/cs/platform/quickinput/common/quickInput";
import {
  IExplorerService,
  type ExplorerPaneInput,
} from "src/cs/workbench/contrib/files/browser/files";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { COMMANDS_QUICK_ACCESS_PREFIX } from "src/cs/workbench/contrib/quickaccess/browser/commandsQuickAccess";

export const FILES_QUICK_ACCESS_PREFIX = "file ";

type ServiceOrResolver<T> = T | (() => T);

const resolveService = <T>(serviceOrResolver: ServiceOrResolver<T>): T =>
  typeof serviceOrResolver === "function"
    ? (serviceOrResolver as () => T)()
    : serviceOrResolver;

export class DefaultQuickAccessProvider extends PickerQuickAccessProvider {
  public constructor(
    @IQuickInputService private readonly quickInputService: ServiceOrResolver<IQuickInputService>,
  ) {
    super();
  }

  protected getPicks(): readonly QuickAccessItem[] {
    return [
      {
        accept: () => resolveService(this.quickInputService).quickAccess.show(FILES_QUICK_ACCESS_PREFIX),
        description: localize("quickAccess.files.description", "Switch the active workbench file"),
        id: "quickAccess.gotoFiles",
        label: localize("quickAccess.files.label", "Go to File"),
      },
      {
        accept: () => resolveService(this.quickInputService).quickAccess.show(COMMANDS_QUICK_ACCESS_PREFIX),
        description: localize("quickAccess.commands.description", "Search available commands"),
        id: "quickAccess.gotoCommands",
        label: localize("quickAccess.commands.label", "Go to Commands"),
      },
    ];
  }
}

export class FilesQuickAccessProvider extends PickerQuickAccessProvider {
  public constructor(
    @IExplorerService private readonly explorerService: ServiceOrResolver<IExplorerService>,
    @IWorkbenchLayoutService private readonly layoutService: ServiceOrResolver<IWorkbenchLayoutService>,
  ) {
    super();
  }

  protected getPicks(filter: string): readonly QuickAccessItem[] {
    const explorerService = resolveService(this.explorerService);
    const layoutService = resolveService(this.layoutService);
    const paneInput = explorerService.getPaneInput();
    const selectionKind = layoutService.activeWorkbenchMainPart;
    if (!paneInput || paneInput.selectionKind !== selectionKind) {
      return [];
    }

    const files = getQuickAccessFiles(paneInput);
    const candidateFileIds = getCandidateFileIds(files);
    const normalizedFilter = filter.trim().toLowerCase();
    return files
      .map(file => {
        const fileId = normalizeFileId(file.fileId);
        if (!fileId) {
          return null;
        }

        const label = String(file.fileName ?? fileId).trim() || fileId;
        const item: QuickAccessItem = {
          accept: () => {
            explorerService.select({
              candidateFileIds,
              fileId,
              kind: selectionKind,
            }, "force");
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

const getQuickAccessFiles = (
  paneInput: ExplorerPaneInput,
): ExplorerPaneInput["files"] =>
  paneInput.quickAccessFiles?.length ? paneInput.quickAccessFiles : paneInput.files;

const getCandidateFileIds = (
  files: ExplorerPaneInput["files"],
): readonly string[] =>
  files
    .map(file => normalizeFileId(file.fileId))
    .filter((fileId): fileId is string => Boolean(fileId));

const normalizeFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const getFileDescription = (
  file: ExplorerPaneInput["files"][number],
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
