/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { createButton, updateButton } from "src/cs/base/browser/ui/button/button";
import { createInputBox } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  MODAL_BACKDROP_CLASS,
  MODAL_OVERLAY_CLASS,
  createModalCloseActionBar,
  getModalDialogClassName,
  getModalDialogId,
  getModalTitleId,
} from "src/cs/base/browser/ui/modal/modal";
import { SelectBox, type SelectBoxOption } from "src/cs/base/browser/ui/selectBox/selectBox";
import { SwitchWidget } from "src/cs/base/browser/ui/switch/switchWidget";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { basename, dirname, joinPath } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { IFileService } from "src/cs/platform/files/common/files";
import type {
  FileSource,
} from "src/cs/workbench/services/files/common/files";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import type {
  ITemplateViewStateService,
  TemplateState,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import { createTemplateApplyPresetRecordFromUserTemplate } from "src/cs/workbench/contrib/template/browser/templateUserTemplateAdapter";
import type { TemplateApplyPresetRecord } from "src/cs/workbench/services/template/common/template";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import {
  createTemplateSelection,
  getTemplateSelectionTemplateId,
  resolveTemplateSelectionForFile,
  type TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { FileSourceWorkflow } from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  TEMPLATE_SLICE_FILE_MIME_TYPE,
  createTemplateSlicePlan,
  normalizeTemplateSliceFilePrefix,
  type TemplateSlicePlan,
} from "src/cs/workbench/contrib/files/browser/sliceWithTemplate";
import type {
  IUserTemplateService,
  UserTemplate,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

import "src/cs/workbench/contrib/files/browser/media/sliceWithTemplate.css";

const SLICE_TEMPLATE_SELECT_DROPDOWN_Z_INDEX = 70;

export type SliceWithTemplateControllerOptions = {
  readonly filesService: IFileService;
  readonly getFiles: () => readonly ExplorerFileEntry[];
  readonly notificationService: INotificationService;
  readonly removeOriginalFile: (fileId: string) => void;
  readonly sliceService: ISliceService;
  readonly sourceWorkflow: FileSourceWorkflow;
  readonly templateViewStateService: ITemplateViewStateService;
  readonly userTemplateService: IUserTemplateService;
};

type SliceDialogState = {
  csvText: string | null;
  errorMessage: string | null;
  fileId: string;
  filePrefixName: string;
  inputPath: string | null;
  isLoading: boolean;
  isSlicing: boolean;
  keepOriginalFile: boolean;
  hasUserSelectedTemplate: boolean;
  selectedTemplateId: string;
  sourcePath: string | null;
  statusMessage: string | null;
  storagePath: string;
  targetLabel: string;
  templates: readonly TemplateApplyPresetRecord[];
};

type ActiveSliceDialog = {
  readonly body: HTMLElement;
  readonly disposeStore: DisposableStore;
  readonly expectedLabel: HTMLElement;
  readonly filePrefixInput: HTMLInputElement;
  readonly keepOriginalSwitch: SwitchWidget;
  readonly overlay: HTMLElement;
  readonly selectBox: SelectBox<string>;
  readonly sliceButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly storagePathInput: HTMLInputElement;
  readonly targetInput: HTMLInputElement;
  state: SliceDialogState;
  syncId: number;
};

export class SliceWithTemplateController extends Disposable {
  private activeDialog: ActiveSliceDialog | null = null;
  private nextSyncId = 0;

  constructor(private readonly options: SliceWithTemplateControllerOptions) {
    super();
  }

  public open(fileId: string): void {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    const file = this.findFile(normalizedFileId);
    if (!file) {
      this.options.notificationService.notify({
        id: "files.sliceWithTemplateMissingTarget",
        message: localize("files.sliceWithTemplate.missingTarget", "The selected file is no longer available."),
        severity: Severity.Warning,
      });
      return;
    }

    this.close();
    const templateState = this.options.templateViewStateService.getState();
    const sliceState = this.options.sliceService.getState();
    const templates = resolveTemplateSliceTemplatesForState({
      templateState,
      templates: this.getCachedUserTemplates(),
    });
    const selectedTemplateId = resolveTemplateSliceSelectedTemplateId({
      fileTemplateSelectionsByFileId: sliceState.templateSelectionsByFileId,
      fileId: normalizedFileId,
      templateState,
      templates,
    });
    const sourcePath = normalizePathText(file.sourcePath);
    const inputPath = resolveSliceInputPath(file);
    const targetResource = inputPath ? URI.file(inputPath) : sourcePath ? URI.file(sourcePath) : null;
    const targetLabel =
      sourcePath ||
      inputPath ||
      String(file.fileName ?? "").trim() ||
      localize("files.sliceWithTemplate.target", "Selected file");
    const state: SliceDialogState = {
      csvText: null,
      errorMessage: null,
      fileId: normalizedFileId,
      filePrefixName: normalizeTemplateSliceFilePrefix(stripCsvExtension(file.fileName) || stripCsvExtension(basename(targetResource ?? URI.file("slice.csv")))),
      inputPath,
      isLoading: true,
      isSlicing: false,
      keepOriginalFile: true,
      hasUserSelectedTemplate: false,
      selectedTemplateId,
      sourcePath,
      statusMessage: localize("files.sliceWithTemplate.loading", "Loading slice target..."),
      storagePath: targetResource ? dirname(targetResource).fsPath : "",
      targetLabel,
      templates,
    };

    const dialog = this.createDialog(state);
    this.activeDialog = dialog;
    this.syncDialog(dialog);
    this.loadDialogData(dialog);
  }

  public close(): void {
    this.activeDialog?.disposeStore.dispose();
    this.activeDialog?.overlay.remove();
    this.activeDialog = null;
  }

  public override dispose(): void {
    this.close();
    super.dispose();
  }

  private createDialog(state: SliceDialogState): ActiveSliceDialog {
    const disposeStore = new DisposableStore();
    const overlay = document.createElement("div");
    overlay.className = MODAL_OVERLAY_CLASS;

    const backdrop = document.createElement("div");
    backdrop.className = MODAL_BACKDROP_CLASS;
    overlay.append(backdrop);

    const dialogId = getModalDialogId("slice-with-template") ?? "slice-with-template-dialog";
    const titleId = getModalTitleId("slice-with-template", "slice-with-template");
    const panel = document.createElement("section");
    panel.className = getModalDialogClassName({
      className: "slice-template-modal",
      size: "lg",
      variant: "solid",
    });
    panel.id = dialogId;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", titleId);

    const header = document.createElement("header");
    header.className = "modal_header slice-template-modal__header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "slice-template-modal__titleWrap";
    titleWrap.append(createLxIcon({ className: "slice-template-modal__titleIcon", icon: LxIcon.fileText, size: 18 }));
    const title = document.createElement("h2");
    title.className = "modal_title slice-template-modal__title";
    title.id = titleId;
    title.textContent = localize("files.sliceWithTemplate.title", "Slice");
    titleWrap.append(title);
    const closeActionBar = disposeStore.add(createModalCloseActionBar({
      className: "slice-template-modal__close",
      id: "files.sliceWithTemplate.close",
      label: localize("files.sliceWithTemplate.close", "Close"),
      run: () => this.close(),
    }));
    header.append(titleWrap, closeActionBar.domNode);

    const body = document.createElement("form");
    body.className = "modal_body slice-template-modal__body";
    body.noValidate = true;

    const targetInput = createInputBox({
      inputClassName: "slice-template-modal__input",
      readOnly: true,
      value: state.targetLabel,
    });
    const templateSelect = new SelectBox<string>({
      className: "slice-template-modal__select",
      disabled: true,
      dropdownZIndex: SLICE_TEMPLATE_SELECT_DROPDOWN_Z_INDEX,
      matchAnchorWidth: true,
      onDidSelect: value => this.updateSelectedTemplate(value),
      options: [],
      value: "",
    });
    disposeStore.add(templateSelect);
    const storagePathInput = createInputBox({
      inputClassName: "slice-template-modal__input",
      placeholder: localize("files.sliceWithTemplate.storagePathPlaceholder", "Folder path"),
      value: state.storagePath,
    });
    const expectedLabel = document.createElement("div");
    expectedLabel.className = "slice-template-modal__expected";
    const filePrefixInput = createInputBox({
      inputClassName: "slice-template-modal__input",
      placeholder: localize("files.sliceWithTemplate.filePrefixPlaceholder", "File prefix"),
      value: state.filePrefixName,
    });
    const keepOriginalSwitch = new SwitchWidget({
      checked: state.keepOriginalFile,
      onDidChangeChecked: checked => {
        const dialog = this.activeDialog;
        if (!dialog) {
          return;
        }
        dialog.state = {
          ...dialog.state,
          errorMessage: null,
          keepOriginalFile: checked,
          statusMessage: null,
        };
        this.syncDialog(dialog);
      },
    });
    disposeStore.add(keepOriginalSwitch);
    const status = document.createElement("p");
    status.className = "slice-template-modal__status";

    body.append(
      createField(localize("files.sliceWithTemplate.sliceTarget", "Slice target"), targetInput),
      createField(localize("files.sliceWithTemplate.templateSelector", "Template selector"), templateSelect.domNode),
      createField(localize("files.sliceWithTemplate.storagePath", "Storage path"), storagePathInput),
      createField(localize("files.sliceWithTemplate.filePrefixName", "File prefix name"), filePrefixInput),
      createSwitchField(
        localize("files.sliceWithTemplate.keepOriginalFile", "Keep original file"),
        keepOriginalSwitch.domNode,
      ),
      createField(localize("files.sliceWithTemplate.expectedSlices", "Expected number of slices"), expectedLabel),
      status,
    );

    const footer = document.createElement("footer");
    footer.className = "modal_footer slice-template-modal__footer";
    const sliceButton = createButton({
      disabled: true,
      label: localize("files.sliceWithTemplate.sliceButton", "Slice"),
      size: "control",
      type: "button",
      variant: "primary",
    });
    footer.append(sliceButton);

    panel.append(header, body, footer);
    overlay.append(panel);
    document.body.append(overlay);

    const dialog: ActiveSliceDialog = {
      body,
      disposeStore,
      expectedLabel,
      filePrefixInput,
      keepOriginalSwitch,
      overlay,
      selectBox: templateSelect,
      sliceButton,
      state,
      status,
      storagePathInput,
      syncId: this.nextSyncId += 1,
      targetInput,
    };

    disposeStore.add(this.options.templateViewStateService.onDidChangeTemplateState(templateState => {
      this.handleTemplateStateChanged(dialog, templateState);
    }));
    disposeStore.add(this.options.userTemplateService.onDidChangeUserTemplates(() => {
      this.handleTemplateListChanged(dialog);
    }));
    disposeStore.add(this.options.sliceService.onDidChangeSliceState(() => {
      this.handleSliceStateChanged(dialog);
    }));
    disposeStore.add(addDisposableListener(backdrop, EventType.MOUSE_DOWN, event => {
      if (event.target === backdrop) {
        this.close();
      }
    }));
    disposeStore.add(addDisposableListener(document, EventType.KEY_DOWN, event => {
      if (event.key === "Escape") {
        this.close();
      }
    }));
    disposeStore.add(addDisposableListener(storagePathInput, EventType.INPUT, () => {
      dialog.state = {
        ...dialog.state,
        errorMessage: null,
        statusMessage: null,
        storagePath: storagePathInput.value,
      };
      this.syncDialog(dialog);
    }));
    disposeStore.add(addDisposableListener(filePrefixInput, EventType.INPUT, () => {
      dialog.state = {
        ...dialog.state,
        errorMessage: null,
        filePrefixName: filePrefixInput.value,
        statusMessage: null,
      };
      this.syncDialog(dialog);
    }));
    disposeStore.add(addDisposableListener(sliceButton, EventType.CLICK, event => {
      event.preventDefault();
      void this.sliceActiveDialog();
    }));
    disposeStore.add(addDisposableListener(body, "submit", event => {
      event.preventDefault();
      void this.sliceActiveDialog();
    }));

    requestAnimationFrame(() => storagePathInput.focus());

    return dialog;
  }

  private async loadDialogData(dialog: ActiveSliceDialog): Promise<void> {
    const syncId = dialog.syncId;
    try {
      const [templates, csvText] = await Promise.all([
        this.options.userTemplateService.refreshTemplates(),
        this.readSliceTargetText(dialog.state),
      ]);
      if (this.activeDialog !== dialog || dialog.syncId !== syncId) {
        return;
      }

      const templateState = this.options.templateViewStateService.getState();
      const resolvedTemplates = resolveTemplateSliceTemplatesForState({
        templateState,
        templates: createTemplateApplyPresetRecordsFromUserTemplates(templates),
      });
      dialog.state = {
        ...dialog.state,
        csvText,
        isLoading: false,
        selectedTemplateId: resolveTemplateSliceSelectedTemplateId({
          currentTemplateId: dialog.state.selectedTemplateId,
          fileTemplateSelectionsByFileId: this.options.sliceService.getState().templateSelectionsByFileId,
          fileId: dialog.state.fileId,
          preserveCurrentTemplate: dialog.state.hasUserSelectedTemplate,
          templateState,
          templates: resolvedTemplates,
        }),
        statusMessage: null,
        templates: resolvedTemplates,
      };
      this.syncDialog(dialog);
    } catch (error) {
      if (this.activeDialog !== dialog || dialog.syncId !== syncId) {
        return;
      }

      dialog.state = {
        ...dialog.state,
        errorMessage: getErrorMessage(error),
        isLoading: false,
        statusMessage: getErrorMessage(error),
      };
      this.syncDialog(dialog);
    }
  }

  private updateSelectedTemplate(templateId: string): void {
    const dialog = this.activeDialog;
    if (!dialog) {
      return;
    }

    dialog.state = {
      ...dialog.state,
      errorMessage: null,
      hasUserSelectedTemplate: true,
      selectedTemplateId: templateId,
      statusMessage: null,
    };
    this.syncDialog(dialog);
  }

  private handleTemplateStateChanged(dialog: ActiveSliceDialog, templateState: TemplateState): void {
    if (this.activeDialog !== dialog || dialog.state.isSlicing) {
      return;
    }

    const templates = resolveTemplateSliceTemplatesForState({
      templateState,
      templates: this.getCachedUserTemplates(),
    });
    dialog.state = {
      ...dialog.state,
      selectedTemplateId: resolveTemplateSliceSelectedTemplateId({
        currentTemplateId: dialog.state.selectedTemplateId,
        fileTemplateSelectionsByFileId: this.options.sliceService.getState().templateSelectionsByFileId,
        fileId: dialog.state.fileId,
        preserveCurrentTemplate: dialog.state.hasUserSelectedTemplate,
        templateState,
        templates,
      }),
      templates,
    };
    this.syncDialog(dialog);
  }

  private handleTemplateListChanged(dialog: ActiveSliceDialog): void {
    if (this.activeDialog !== dialog || dialog.state.isSlicing) {
      return;
    }

    const templateState = this.options.templateViewStateService.getState();
    const templates = resolveTemplateSliceTemplatesForState({
      templateState,
      templates: this.getCachedUserTemplates(),
    });
    dialog.state = {
      ...dialog.state,
      selectedTemplateId: resolveTemplateSliceSelectedTemplateId({
        currentTemplateId: dialog.state.selectedTemplateId,
        fileTemplateSelectionsByFileId: this.options.sliceService.getState().templateSelectionsByFileId,
        fileId: dialog.state.fileId,
        preserveCurrentTemplate: dialog.state.hasUserSelectedTemplate,
        templateState,
        templates,
      }),
      templates,
    };
    this.syncDialog(dialog);
  }

  private handleSliceStateChanged(dialog: ActiveSliceDialog): void {
    if (this.activeDialog !== dialog || dialog.state.isSlicing) {
      return;
    }

    const templateState = this.options.templateViewStateService.getState();
    const templates = resolveTemplateSliceTemplatesForState({
      templateState,
      templates: this.getCachedUserTemplates(),
    });
    dialog.state = {
      ...dialog.state,
      selectedTemplateId: resolveTemplateSliceSelectedTemplateId({
        currentTemplateId: dialog.state.selectedTemplateId,
        fileTemplateSelectionsByFileId: this.options.sliceService.getState().templateSelectionsByFileId,
        fileId: dialog.state.fileId,
        preserveCurrentTemplate: dialog.state.hasUserSelectedTemplate,
        templateState,
        templates,
      }),
      templates,
    };
    this.syncDialog(dialog);
  }

  private syncDialog(dialog: ActiveSliceDialog): void {
    const state = dialog.state;
    const templateOptions = createUserTemplateOptions(state.templates);
    const selectedTemplateId = templateOptions.some(option => option.value === state.selectedTemplateId)
      ? state.selectedTemplateId
      : "";
    if (selectedTemplateId !== state.selectedTemplateId) {
      dialog.state = {
        ...state,
        selectedTemplateId,
      };
    }

    dialog.targetInput.value = dialog.state.targetLabel;
    dialog.storagePathInput.value = dialog.state.storagePath;
    dialog.filePrefixInput.value = dialog.state.filePrefixName;
    dialog.selectBox.update({
      className: "slice-template-modal__select",
      disabled: dialog.state.isLoading || dialog.state.isSlicing || templateOptions.length === 0,
      dropdownZIndex: SLICE_TEMPLATE_SELECT_DROPDOWN_Z_INDEX,
      matchAnchorWidth: true,
      onDidSelect: value => this.updateSelectedTemplate(value),
      options: templateOptions.length
        ? createTemplateSelectOptions(templateOptions, dialog.state.selectedTemplateId)
        : [{
            disabled: true,
            label: localize("files.sliceWithTemplate.noTemplates", "No custom templates"),
            value: "",
          }],
      value: dialog.state.selectedTemplateId,
    });
    dialog.keepOriginalSwitch.update({
      checked: dialog.state.keepOriginalFile,
      disabled: dialog.state.isSlicing,
    });
    dialog.expectedLabel.textContent = this.getExpectedSliceLabel(dialog.state);
    dialog.expectedLabel.dataset.state = dialog.state.errorMessage ? "error" : "ready";
    const canSlice = this.canSlice(dialog.state, templateOptions.length);
    updateButton(dialog.sliceButton, {
      disabled: !canSlice,
      label: dialog.state.isSlicing
        ? localize("files.sliceWithTemplate.slicing", "Slicing...")
        : localize("files.sliceWithTemplate.sliceButton", "Slice"),
      size: "control",
      type: "button",
      variant: "primary",
    });

    const statusMessage = dialog.state.statusMessage ?? dialog.state.errorMessage ?? "";
    dialog.status.textContent = statusMessage;
    dialog.status.hidden = !statusMessage;
    dialog.status.dataset.state = dialog.state.errorMessage ? "error" : "info";
  }

  private getExpectedSliceLabel(state: SliceDialogState): string {
    if (state.isLoading) {
      return localize("files.sliceWithTemplate.expectedLoading", "Loading...");
    }

    const template = findTemplateById(state.templates, state.selectedTemplateId);
    if (!template || !state.csvText) {
      return localize("files.sliceWithTemplate.expectedUnavailable", "Unavailable");
    }

    try {
      const plan = createTemplateSlicePlan({
        csvText: state.csvText,
        filePrefixName: state.filePrefixName,
        template,
      });
      return localize(
        "files.sliceWithTemplate.expectedCount",
        "{count} file(s)",
        { count: plan.slices.length },
      );
    } catch (error) {
      return getErrorMessage(error);
    }
  }

  private canSlice(state: SliceDialogState, templateOptionCount: number): boolean {
    if (
      state.isLoading ||
      state.isSlicing ||
      !state.csvText ||
      !state.selectedTemplateId ||
      !state.storagePath.trim() ||
      !templateOptionCount
    ) {
      return false;
    }

    const template = findTemplateById(state.templates, state.selectedTemplateId);
    if (!template) {
      return false;
    }

    try {
      createTemplateSlicePlan({
        csvText: state.csvText,
        filePrefixName: state.filePrefixName,
        template,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async sliceActiveDialog(): Promise<void> {
    const dialog = this.activeDialog;
    if (!dialog || dialog.state.isSlicing) {
      return;
    }

    const template = findTemplateById(dialog.state.templates, dialog.state.selectedTemplateId);
    if (!template || !dialog.state.csvText) {
      return;
    }

    let plan: TemplateSlicePlan;
    try {
      plan = createTemplateSlicePlan({
        csvText: dialog.state.csvText,
        filePrefixName: dialog.state.filePrefixName,
        template,
      });
    } catch (error) {
      dialog.state = {
        ...dialog.state,
        errorMessage: getErrorMessage(error),
        statusMessage: getErrorMessage(error),
      };
      this.syncDialog(dialog);
      return;
    }

    const storagePath = dialog.state.storagePath.trim();
    if (!storagePath) {
      dialog.state = {
        ...dialog.state,
        errorMessage: localize("files.sliceWithTemplate.storagePathRequired", "Storage path is required."),
        statusMessage: localize("files.sliceWithTemplate.storagePathRequired", "Storage path is required."),
      };
      this.syncDialog(dialog);
      return;
    }

    dialog.state = {
      ...dialog.state,
      errorMessage: null,
      isSlicing: true,
      statusMessage: localize("files.sliceWithTemplate.writing", "Writing slice files..."),
    };
    this.syncDialog(dialog);

    try {
      const sources = await this.writeSliceFiles(URI.file(storagePath), plan);
      await this.options.sourceWorkflow.importGeneratedFiles(sources, {
        preserveSelection: true,
        shouldContinue: () => this.activeDialog === dialog,
      });
      await this.removeOriginalIfNeeded(dialog.state);
      this.options.notificationService.notify({
        id: "files.sliceWithTemplateComplete",
        message: localize(
          "files.sliceWithTemplate.complete",
          "Created {count} sliced file(s).",
          { count: plan.slices.length },
        ),
        severity: Severity.Info,
      });
      this.close();
    } catch (error) {
      if (this.activeDialog !== dialog) {
        return;
      }
      dialog.state = {
        ...dialog.state,
        errorMessage: getErrorMessage(error),
        isSlicing: false,
        statusMessage: getErrorMessage(error),
      };
      this.syncDialog(dialog);
    }
  }

  private async writeSliceFiles(folder: URI, plan: TemplateSlicePlan): Promise<FileSource[]> {
    const sources: FileSource[] = [];
    const now = Date.now();

    for (const slice of plan.slices) {
      const resource = joinPath(folder, slice.fileName);
      await this.options.filesService.writeFile(resource, slice.content);
      const file = new File([slice.content], slice.fileName, {
        lastModified: now + slice.index,
        type: TEMPLATE_SLICE_FILE_MIME_TYPE,
      });
      sources.push({
        canUseNativePath: true,
        file,
        fileName: slice.fileName,
        kind: "path",
        lastModified: file.lastModified,
        relativePath: slice.fileName,
        resource,
        size: file.size,
      });
    }

    return sources;
  }

  private async removeOriginalIfNeeded(state: SliceDialogState): Promise<void> {
    if (state.keepOriginalFile) {
      return;
    }

    if (state.sourcePath) {
      await this.options.filesService.deleteFile(URI.file(state.sourcePath));
    }

    this.options.removeOriginalFile(state.fileId);
  }

  private async readSliceTargetText(state: SliceDialogState): Promise<string> {
    if (state.inputPath) {
      return (await this.options.filesService.readFile(URI.file(state.inputPath), {
        encoding: "utf8",
      })).value;
    }

    const fileEntry = this.findFile(state.fileId);
    const sourceName = String(fileEntry?.fileName ?? fileEntry?.sourcePath ?? "").trim();
    if (sourceName && !sourceName.toLowerCase().endsWith(".csv")) {
      throw new Error(localize(
        "files.sliceWithTemplate.csvRequired",
        "Slice target requires CSV content or a converted CSV artifact.",
      ));
    }

    const file = fileEntry?.file;
    if (file && typeof file === "object" && "text" in file && typeof file.text === "function") {
      return file.text();
    }

    throw new Error(localize("files.sliceWithTemplate.contentUnavailable", "Slice target content is unavailable."));
  }

  private findFile(fileId: string): ExplorerFileEntry | null {
    return this.options.getFiles().find(file => String(file.fileId ?? "").trim() === fileId) ?? null;
  }

  private getCachedUserTemplates(): readonly TemplateApplyPresetRecord[] {
    return createTemplateApplyPresetRecordsFromUserTemplates(
      this.options.userTemplateService.getSnapshot().templates,
    );
  }

}

const createTemplateApplyPresetRecordsFromUserTemplates = (
  templates: readonly UserTemplate[],
): readonly TemplateApplyPresetRecord[] =>
  templates.map(createTemplateApplyPresetRecordFromUserTemplate);

function createField(labelText: string, control: HTMLElement): HTMLElement {
  const field = document.createElement("label");
  field.className = "slice-template-modal__field";
  const label = document.createElement("span");
  label.className = "slice-template-modal__label";
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function createSwitchField(labelText: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "slice-template-modal__switchField";
  const label = document.createElement("span");
  label.className = "slice-template-modal__label";
  label.textContent = labelText;
  row.append(label, control);
  return row;
}

function createUserTemplateOptions(templates: readonly TemplateApplyPresetRecord[]): SelectBoxOption<string>[] {
  return templates
    .map(template => {
      const templateId = String(template.id ?? "").trim();
      return {
        label: String(template.name ?? "").trim() || templateId,
        value: templateId,
      };
    })
    .filter((option): option is SelectBoxOption<string> => Boolean(option.value));
}

function createTemplateSelectOptions(
  templateOptions: readonly SelectBoxOption<string>[],
  selectedTemplateId: string,
): SelectBoxOption<string>[] {
  if (selectedTemplateId) {
    return [...templateOptions];
  }

  return [
    {
      disabled: true,
      label: localize("files.sliceWithTemplate.selectTemplatePlaceholder", "Select template"),
      value: "",
    },
    ...templateOptions,
  ];
}

function findTemplateById(
  templates: readonly TemplateApplyPresetRecord[],
  templateId: string,
): TemplateApplyPresetRecord | null {
  return templates.find(template => String(template.id ?? "").trim() === templateId) ?? null;
}

export function resolveTemplateSliceSelectedTemplateId({
  currentTemplateId,
  fileId,
  fileTemplateSelectionsByFileId = {},
  preserveCurrentTemplate = false,
  templateState,
  templates,
}: {
  readonly currentTemplateId?: string | null;
  readonly fileId: string | null | undefined;
  readonly fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  readonly preserveCurrentTemplate?: boolean;
  readonly templateState: TemplateState;
  readonly templates: readonly TemplateApplyPresetRecord[];
}): string {
  const normalizedCurrentTemplateId = String(currentTemplateId ?? "").trim();
  if (preserveCurrentTemplate && hasUserTemplateId(templates, normalizedCurrentTemplateId)) {
    return normalizedCurrentTemplateId;
  }

  const currentSelection = createTemplateSelection(templateState.selectedTemplateId);
  const resolvedSelection = resolveTemplateSelectionForFile(
    fileId,
    fileTemplateSelectionsByFileId,
    currentSelection,
  );
  const resolvedTemplateId = getTemplateSelectionTemplateId(resolvedSelection);
  if (resolvedTemplateId && hasUserTemplateId(templates, resolvedTemplateId)) {
    return resolvedTemplateId;
  }

  return "";
}

export function resolveTemplateSliceTemplatesForState({
  templateState,
  templates,
}: {
  readonly templateState: TemplateState;
  readonly templates: readonly TemplateApplyPresetRecord[];
}): readonly TemplateApplyPresetRecord[] {
  const selectedTemplateId = String(templateState.selectedTemplateId ?? "").trim();
  if (!selectedTemplateId || !hasTemplateFormConfigValue(templateState.formState)) {
    return templates;
  }

  const index = templates.findIndex(template => String(template.id ?? "").trim() === selectedTemplateId);
  if (index === -1) {
    return templates;
  }

  const nextTemplates = [...templates];
  nextTemplates[index] = {
    ...nextTemplates[index],
    ...templateState.formState,
    id: selectedTemplateId,
  };
  return nextTemplates;
}

function hasUserTemplateId(templates: readonly TemplateApplyPresetRecord[], templateId: string): boolean {
  return Boolean(templateId) &&
    templates.some(template => String(template.id ?? "").trim() === templateId);
}

function hasTemplateFormConfigValue(formState: TemplateState["formState"]): boolean {
  return Boolean(
    String(formState.name ?? "").trim() ||
    String(formState.xDataStart ?? "").trim() ||
    String(formState.xDataEnd ?? "").trim() ||
    formState.xColumns.length ||
    formState.xRanges.length ||
    formState.yColumns.length,
  );
}

function resolveSliceInputPath(file: ExplorerFileEntry): string | null {
  const sourcePath = normalizePathText(file.sourcePath);
  const normalizedCsvPath = normalizePathText(file.normalizedCsvPath);
  if (normalizedCsvPath) {
    return normalizedCsvPath;
  }

  return sourcePath && sourcePath.toLowerCase().endsWith(".csv") ? sourcePath : null;
}

function normalizePathText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stripCsvExtension(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\.(csv|xls|xlsx)$/i, "");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return localizeSliceErrorMessage(error.message.trim());
  }

  return String(error ?? localize("files.sliceWithTemplate.unknownError", "Slice failed."));
}

function localizeSliceErrorMessage(message: string): string {
  switch (message) {
    case "Slice target has no CSV rows.":
      return localize("files.sliceWithTemplate.errorNoRows", "Slice target has no CSV rows.");
    case "Template must define a valid X data range.":
      return localize("files.sliceWithTemplate.errorInvalidRange", "Template must define a valid X data range.");
    case "Template segment count must be a positive integer.":
      return localize("files.sliceWithTemplate.errorInvalidSegmentCount", "Template segment count must be a positive integer.");
    case "Template points per group must be a positive integer.":
      return localize("files.sliceWithTemplate.errorInvalidPointsPerGroup", "Template points per group must be a positive integer.");
    case "Template X/Y columns cannot be paired for slicing.":
      return localize("files.sliceWithTemplate.errorInvalidXYColumns", "Template X/Y columns cannot be paired for slicing.");
  }

  const segmentMatch = /^X range has (\d+) rows, which is not divisible by (\d+) segments\.$/.exec(message);
  if (segmentMatch) {
    return localize(
      "files.sliceWithTemplate.errorSegmentRowsNotDivisible",
      "X range has {total} rows, which is not divisible by {segments} segments.",
      { segments: segmentMatch[2], total: segmentMatch[1] },
    );
  }

  const pointsMatch = /^X range has (\d+) rows, which is not divisible by (\d+) points per group\.$/.exec(message);
  if (pointsMatch) {
    return localize(
      "files.sliceWithTemplate.errorPointRowsNotDivisible",
      "X range has {total} rows, which is not divisible by {points} points per group.",
      { points: pointsMatch[2], total: pointsMatch[1] },
    );
  }

  return message;
}
