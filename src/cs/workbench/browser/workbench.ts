import { layoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  LanguageCode,
  TranslateFn,
  TranslationVars,
} from "src/cs/platform/language/common/language";
import { isLanguageCode } from "src/cs/platform/language/common/language";
import { Layout, type LayoutView } from "src/cs/workbench/browser/layout";
import type { WorkbenchTitlebarProps } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import type { WorkbenchStyle } from "src/cs/workbench/browser/style";
import {
  getWorkbenchWindowState,
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import DataViewPane from "src/cs/workbench/contrib/data/browser/dataViewPane";
import { ImporterViewletHost } from "src/cs/workbench/contrib/import/browser/importerViewletHost";
import type {
  ImportedFileInfo,
  ImporterRef,
} from "src/cs/workbench/contrib/import/common/types";
import enMessages from "src/i18n/en";
import zhMessages from "src/i18n/zh";

export type WorkbenchTitlebarState = {
  readonly enabled?: boolean;
  readonly activePage: LayoutView;
  readonly analysisActiveFileId?: string | null;
  readonly analysisFileOptions?: WorkbenchTitlebarProps["analysisFileOptions"];
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly onAnalysisFileChange?: (fileId: string) => void;
  readonly onAnalysisIntent?: () => void;
  readonly onCloseWindow?: () => void;
  readonly onMinimizeWindow?: () => void;
  readonly onNavigateBack?: () => void;
  readonly onNavigateForward?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onPageChange?: (page: "data" | "analysis") => void;
  readonly onToggleMaximizeWindow?: () => void;
  readonly showAnalysisFileSelector?: boolean;
  readonly t: TranslateFn;
  readonly updateVersion?: string | null;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onInstallUpdate?: () => void;
};

export type WorkbenchOptions = {
  readonly className?: string;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly titlebarState?: WorkbenchTitlebarState;
};

export const createTitlebarState = (
  state: WorkbenchTitlebarState | undefined,
): WorkbenchTitlebarProps | undefined =>
  state && state.enabled !== false
    ? {
        id: layoutService.elements.titlebarCommandBar,
        activePage: state.activePage,
        analysisActiveFileId: state.analysisActiveFileId,
        analysisFileOptions: state.analysisFileOptions,
        canNavigateBack: state.canNavigateBack,
        canNavigateForward: state.canNavigateForward,
        onAnalysisFileChange: state.onAnalysisFileChange,
        onAnalysisIntent: state.onAnalysisIntent,
        onCloseWindow: state.onCloseWindow,
        onMinimizeWindow: state.onMinimizeWindow,
        onNavigateBack: state.onNavigateBack,
        onNavigateForward: state.onNavigateForward,
        onOpenSettings: state.onOpenSettings,
        onPageChange: state.onPageChange,
        onToggleMaximizeWindow: state.onToggleMaximizeWindow,
        showAnalysisFileSelector: state.showAnalysisFileSelector,
        t: state.t,
        updateAction: {
          isVisible: Boolean(state.isUpdateReadyToInstall),
          isReadyToInstall: state.isUpdateReadyToInstall,
          version: state.updateVersion,
          onClick: state.onInstallUpdate,
        },
      }
    : undefined;

const messagesByLanguage: Record<LanguageCode, Record<string, string>> = {
  en: enMessages,
  zh: zhMessages,
};

const createTranslator = (): TranslateFn => {
  const language = isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
    ? window.__CONDUCTOR_INITIAL_LANGUAGE__
    : "zh";
  const messages = messagesByLanguage[language];

  return (key: string, vars?: TranslationVars) => {
    let message = messages[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        message = message.replaceAll(`{${name}}`, String(value ?? ""));
      }
    }
    return message;
  };
};

export class Workbench extends Layout {
  private readonly window: WorkbenchWindow;
  private readonly t = createTranslator();
  private readonly importerRef: { current: ImporterRef | null } = { current: null };
  private readonly importer: ImporterViewletHost;
  private readonly data: DataViewPane;
  private rawData: ImportedFileInfo[] = [];
  private selectedFileId: string | null = null;

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  constructor(parent: HTMLElement, options: WorkbenchOptions = {}) {
    super();

    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      titlebarState: createTitlebarState(options.titlebarState),
      showSkeleton: false,
    }));
    this.mount(this.window.contentElement);
    this.importer = this._register(new ImporterViewletHost(this.getImporterProps()));
    this.data = this._register(new DataViewPane(this.getDataProps()));
    this.renderWorkbench();
  }

  update(options: WorkbenchOptions = {}): void {
    this.window.update({
      ...options,
      titlebarState: createTitlebarState(options.titlebarState),
    });
  }

  private renderWorkbench(): void {
    this.importer.update(this.getImporterProps());
    this.data.update(this.getDataProps());
    this.setParts({
      sidebar: this.importer.element,
      data: this.data.element,
      analysis: this.createMessagePane(
        this.t("da_analysis_visualization"),
        this.rawData.length === 0
          ? this.t("da_extractImportCsvFirst")
          : this.t("da_apply_to_new_files_requires_full_apply"),
      ),
      settings: this.createMessagePane(
        this.t("da_settings_title"),
        this.t("da_settings_section_aria_label"),
      ),
    });
    this.window.update({
      id: "analysis-page",
      className: "relative w-full h-full min-h-0 overflow-hidden",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titlebarState: createTitlebarState(this.getTitlebarState()),
    });
  }

  protected override onDidRenderLayout(): void {
    this.window.update({
      id: "analysis-page",
      className: "relative w-full h-full min-h-0 overflow-hidden",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titlebarState: createTitlebarState(this.getTitlebarState()),
    });
  }

  private getTitlebarState(): WorkbenchTitlebarState {
    const state = this.state;
    return {
      activePage: state.activeView,
      canNavigateBack: state.layoutState.canNavigateBack,
      canNavigateForward: state.layoutState.canNavigateForward,
      enabled: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      onNavigateBack: () => this.navigateBack(),
      onNavigateForward: () => this.navigateForward(),
      onOpenSettings: () => this.navigateToView("settings"),
      onPageChange: (page) => this.navigateToView(page),
      t: this.t,
    };
  }

  private getImporterProps() {
    return {
      hasSessionData: this.rawData.length > 0,
      importerRef: this.importerRef,
      onClearSession: this.clearSession,
      onDataImported: this.addImportedFile,
      onDataRemoved: this.removeImportedFile,
      onFileSelected: this.selectFile,
      onImportTrigger: () => this.importerRef.current?.openFileDialog(),
      rawData: this.rawData,
      selectedPreviewFileId: this.selectedFileId,
      t: this.t,
    };
  }

  private getDataProps() {
    return {
      content: this.createDataContent(),
      rawData: this.rawData,
      t: this.t,
    };
  }

  private createDataContent(): HTMLElement {
    const selectedFile = this.rawData.find(file => file.fileId === this.selectedFileId);
    const root = document.createElement("div");
    root.className = "flex h-full min-h-0 flex-col p-4";

    if (!selectedFile) {
      root.append(
        this.createMessagePane(
          this.t("da_data_extraction_template"),
          this.rawData.length === 0
            ? this.t("da_extractImportCsvFirst")
            : this.t("da_extractSelectYColumn"),
        ),
      );
      return root;
    }

    const title = document.createElement("h2");
    title.className = "text-sm font-semibold text-text-primary";
    title.textContent = selectedFile.fileName;

    const meta = document.createElement("p");
    meta.className = "mt-2 text-xs text-text-secondary";
    meta.textContent = `${Math.round(selectedFile.size / 1024)} KB`;

    root.append(title, meta);
    return root;
  }

  private createMessagePane(titleText: string, descriptionText: string): HTMLElement {
    const root = document.createElement("div");
    root.className =
      "flex h-full min-h-[180px] flex-col items-center justify-center rounded-lg border border-border/60 bg-bg-surface/60 p-6 text-center";

    const title = document.createElement("h2");
    title.className = "text-sm font-semibold text-text-primary";
    title.textContent = titleText;

    const description = document.createElement("p");
    description.className = "mt-2 max-w-sm text-xs text-text-secondary";
    description.textContent = descriptionText;

    root.append(title, description);
    return root;
  }

  private readonly addImportedFile = (fileInfo: ImportedFileInfo): void => {
    this.rawData = [
      ...this.rawData.filter(file => file.fileId !== fileInfo.fileId),
      fileInfo,
    ];
    this.selectedFileId = fileInfo.fileId;
    this.renderWorkbench();
  };

  private readonly removeImportedFile = (fileId: string): void => {
    this.rawData = this.rawData.filter(file => file.fileId !== fileId);
    if (this.selectedFileId === fileId) {
      this.selectedFileId = this.rawData[0]?.fileId ?? null;
    }
    this.renderWorkbench();
  };

  private readonly selectFile = (fileId: string | null): void => {
    this.selectedFileId = fileId;
    this.renderWorkbench();
  };

  private readonly clearSession = (): void => {
    this.rawData = [];
    this.selectedFileId = null;
    this.renderWorkbench();
  };
}
