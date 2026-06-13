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

export class DefaultQuickAccessProvider extends PickerQuickAccessProvider {
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

export class FilesQuickAccessProvider extends PickerQuickAccessProvider {
  public constructor(
    @IExplorerService private readonly explorerService: IExplorerService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
  ) {
    super();
  }

  protected getPicks(filter: string): readonly QuickAccessItem[] {
    const paneInput = this.explorerService.getPaneInput();
    const selectionKind = this.layoutService.activeWorkbenchMainPart;
    if (!paneInput || paneInput.selectionKind !== selectionKind) {
      return [];
    }

    const candidateFileIds = getCandidateFileIds(paneInput);
    const normalizedFilter = filter.trim().toLowerCase();
    return paneInput.files
      .map(file => {
        const fileId = normalizeFileId(file.fileId);
        if (!fileId) {
          return null;
        }

        const label = String(file.fileName ?? fileId).trim() || fileId;
        const item: QuickAccessItem = {
          accept: () => {
            this.explorerService.select({
              candidateFileIds,
              fileId,
              kind: selectionKind,
            }, "force");
          },
          description: file.relativePath ?? file.sourcePath ?? undefined,
          id: fileId,
          label,
        };
        return item;
      })
      .filter((item): item is QuickAccessItem => Boolean(item))
      .filter(item => !normalizedFilter || `${item.label} ${item.description ?? ""} ${item.id}`.toLowerCase().includes(normalizedFilter));
  }
}

const getCandidateFileIds = (paneInput: ExplorerPaneInput): readonly string[] =>
  paneInput.files
    .map(file => normalizeFileId(file.fileId))
    .filter((fileId): fileId is string => Boolean(fileId));

const normalizeFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};
