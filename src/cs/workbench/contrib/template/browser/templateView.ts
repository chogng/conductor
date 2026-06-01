import { lxAdd, lxChevronDown, lxEdit } from "@chogng/lxicon";

import { createButton } from "src/cs/base/browser/ui/button/button";
import { getCardClassName } from "src/cs/base/browser/ui/card/card";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  createMenuAction,
  createMenuButton,
  createMenuItemLabel,
} from "src/cs/base/browser/ui/menu/menu";
import { Separator, type IAction } from "src/cs/base/common/actions";
import {
  getInputFieldClassName,
  getInputFieldState,
  getInputNativeClassName,
} from "src/cs/base/browser/ui/input/input";
import {
  createSwitch as createBaseSwitch,
  updateSwitch,
} from "src/cs/base/browser/ui/switch/switch";
import { localize } from "src/cs/nls";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import type {
  PreviewFileLike,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import DataPreviewArea from "src/cs/workbench/contrib/data/DataPreviewArea";
import TemplateManagerPreviewWorkspace from "./templatePreviewWorkspace";
import {
  createEmptyTemplateConfig,
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
  toTemplateNameKey,
  type TemplateConfig,
} from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { getSession, defaultSessionModel } from "src/cs/workbench/contrib/session/useSession";
import { analysisStoreClient } from "src/cs/workbench/services/storage/electron-sandbox/analysisStoreClient";
import { Toast } from "src/cs/base/browser/ui/toast/toast";
import {
  validateTemplateForSave,
  validateTemplateForApply,
} from "src/cs/workbench/contrib/template/common/templateValidation";
import { AUTO_TEMPLATE_ID } from "src/cs/workbench/common/deviceAnalysis/autoExtraction";
import { downloadTemplateBundle } from "src/cs/workbench/contrib/template/browser/templateController";

export type TemplateManagerProps = {
  readonly t: TranslateFn;
  readonly importerElement?: HTMLElement | null;
  previewFile?: PreviewFileLike | null;
  previewStatus?: Partial<SessionPreviewStatus> | null;
  rawData?: RawDataEntry[];
  getPreviewRow?: (rowIndex: number) => unknown;
  ensurePreviewCells?: (fileId: string, cells: Array<{
    colIndex: number;
    rowIndex: number;
  }>) => Promise<unknown> | unknown;
  ensurePreviewRows?: (fileId: string, startRow: number, endRow: number) => Promise<unknown> | unknown;
  onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  getPreviewRowsVersion?: () => number;
  analysisSettings?: Record<string, unknown> | null;
  onUpdateSettings?: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

let cachedTemplates: any[] | null = null;
let templatesLoading = false;
let globalToast: Toast | null = null;

const showToast = (message: string, type: "success" | "error" | "warning" | "info" = "success") => {
  if (!globalToast) {
    globalToast = new Toast();
  }
  globalToast.show({ message, type });
};

const createField = ({
  label,
  name,
  value,
  onInput,
}: {
  label: string;
  name: keyof TemplateConfig;
  value: string;
  onInput: (name: keyof TemplateConfig, value: string) => void;
}): HTMLElement => {
  const wrapper = document.createElement("label");
  wrapper.className = "template_field";

  const labelElement = document.createElement("span");
  labelElement.className = "text-xs text-text-secondary font-medium mb-1";
  labelElement.textContent = label;

  const input = document.createElement("input");
  input.className = `${getInputNativeClassName()} ${getInputFieldClassName({ fieldClassName: "template_field_input" })}`;
  input.dataset.state = getInputFieldState();
  input.value = value;
  input.autocomplete = "off";
  input.addEventListener("input", () => onInput(name, input.value));

  wrapper.append(labelElement, input);
  return wrapper;
};

const createToggleSwitch = (
  checked: boolean,
  onCheckedChange: (checked: boolean) => void,
): HTMLButtonElement => {
  const button = createBaseSwitch({
    checked,
    size: "sm",
  });
  button.addEventListener("click", () => {
    const nextChecked = button.getAttribute("aria-checked") !== "true";
    updateSwitch(button, {
      checked: nextChecked,
      size: "sm",
    });
    onCheckedChange(nextChecked);
  });
  return button;
};

const importTemplates = async (payload: any, t: TranslateFn, session: any) => {
  let entry = payload;
  if (payload && payload.source === "conductor") {
    entry = payload;
  }
  
  const draft = normalizeTemplateConfigRecord(entry);
  if (!draft.name) {
    showToast(localize("da_template_import_invalid_format", "Invalid template file format."), "warning");
    return;
  }

  if (cachedTemplates) {
    const nameKey = toTemplateNameKey(draft.name);
    const conflict = cachedTemplates.some((t: any) => toTemplateNameKey(t.name) === nameKey);
    if (conflict) {
      let suffix = 1;
      let newName = `${draft.name}(${suffix})`;
      while (cachedTemplates.some((t: any) => toTemplateNameKey(t.name) === toTemplateNameKey(newName))) {
        suffix++;
        newName = `${draft.name}(${suffix})`;
      }
      const confirmMessage = localize(
        "da_template_import_conflict",
        "Template \"{name}\" already exists.\nOK: import as \"{newName}\".\nCancel: overwrite the existing template.",
        { name: draft.name, newName },
      );
      const shouldRename = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(confirmMessage) : true;
      if (shouldRename) {
        draft.name = newName;
      } else {
        const confTemplate = cachedTemplates.find((t: any) => toTemplateNameKey(t.name) === nameKey);
        if (confTemplate && confTemplate.id) {
          try {
            await analysisStoreClient.deleteDeviceAnalysisTemplate(confTemplate.id);
          } catch (err) {
            // Ignore delete conflict errors or proceed
          }
        }
      }
    }
  }

  const validation = validateTemplateForSave(draft, t as any);
  if (!validation.ok || !validation.normalized) {
    showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
    return;
  }

  try {
    const savedRaw = await analysisStoreClient.createDeviceAnalysisTemplate({
      ...validation.normalized,
      name: draft.name,
    });
    const saved = savedRaw as any;
    if (cachedTemplates) {
      cachedTemplates = [saved, ...cachedTemplates.filter((t: any) => t.id !== saved.id && toTemplateNameKey(t.name) !== toTemplateNameKey(saved.name))];
    } else {
      cachedTemplates = [saved];
    }
    
    session.setSelectedTemplateId(saved.id);
    session.setTemplateConfig(cloneTemplateConfig(saved));
    showToast(localize("da_template_imported", "Template imported"), "success");
    defaultSessionModel.emitChange();
  } catch (err) {
    showToast(localize("da_template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
  }
};

const exportTemplate = (config: TemplateConfig) => {
  if (!config.name) {
    showToast(localize("da_template_export_requires_selection", "Please select a template to export."), "warning");
    return;
  }
  const payload = {
    version: 1,
    source: "conductor",
    ...config,
  };
  downloadTemplateBundle(payload);
};

export const createTemplateManager = ({
  importerElement,
  previewFile,
  previewStatus,
  rawData = [],
  getPreviewRow,
  ensurePreviewRows,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  subscribePreviewRowsVersion,
  getPreviewRowsVersion,
  t,
}: TemplateManagerProps): HTMLElement => {
  const session = getSession();
  const templateMode = session.templateMode;
  const config = session.templateConfig;
  const selectedTemplateId = session.selectedTemplateId;
  const containerRef = { current: null as HTMLElement | null };

  const setConfig = (next: TemplateConfig | ((previous: TemplateConfig) => TemplateConfig)) => {
    const nextConfig = typeof next === "function" ? next(session.templateConfig) : next;
    session.setTemplateConfig(nextConfig);
    defaultSessionModel.emitChange();
  };

  const writeFieldFromPreview = (field: string, value: string) => {
    if (!(field in session.templateConfig)) return;
    session.setTemplateConfig({
      ...session.templateConfig,
      [field]: value,
    });
    defaultSessionModel.emitChange();
  };

  if (cachedTemplates === null && !templatesLoading) {
    templatesLoading = true;
    analysisStoreClient.getDeviceAnalysisTemplates()
      .then((remote) => {
        cachedTemplates = Array.isArray(remote) ? remote : [];
        templatesLoading = false;
        defaultSessionModel.emitChange();
      })
      .catch((err) => {
        templatesLoading = false;
        showToast(
          localize("da_loadTemplatesFailed", "Failed to load templates: {error}", {
            error: err instanceof Error ? err.message : String(err),
          }),
          "error",
        );
      });
  }

  const panel = document.createElement("div");
  panel.className = "template_manager";
  containerRef.current = panel;

  const createModeContent = (mode: "select" | "save"): HTMLElement => {
    const leftContent = document.createElement("div");
    leftContent.className = "template_config_panel_content";

    if (mode === "select") {
    // Dropdown row
    const dropdownRow = document.createElement("div");
    dropdownRow.className = "flex flex-col gap-1.5";

    const dropdownLabel = document.createElement("span");
    dropdownLabel.className = "text-xs font-medium text-text-secondary";
    dropdownLabel.textContent = localize("da_template_select_label", "Select template");
    dropdownRow.append(dropdownLabel);

    const selectContainer = document.createElement("div");
    selectContainer.className = "template_button_row template_select_actions";

    const selectedTemplateLabel = (() => {
      if (!selectedTemplateId || selectedTemplateId === AUTO_TEMPLATE_ID) {
        return localize("da_template_auto_extraction", "Auto extraction");
      }

      const found = cachedTemplates?.find((template: any) => template.id === selectedTemplateId);
      return found?.name || selectedTemplateId;
    })();

    const createTemplate = () => {
      session.setSelectedTemplateId(null);
      session.setTemplateConfig(createEmptyTemplateConfig({
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      }));
      session.setTemplateMode("save");
      defaultSessionModel.emitChange();
    };

    const editTemplate = (template: Partial<TemplateConfig> & { readonly id?: string }) => {
      const templateId = String(template.id ?? "");
      if (!templateId) {
        return;
      }

      session.setSelectedTemplateId(templateId);
      session.setTemplateConfig(cloneTemplateConfig(template));
      session.setTemplateMode("save");
      defaultSessionModel.emitChange();
    };

    const selectTemplate = (templateId: string) => {
      if (templateId === AUTO_TEMPLATE_ID) {
        session.setSelectedTemplateId(AUTO_TEMPLATE_ID);
        session.setTemplateConfig(createEmptyTemplateConfig({
          stopOnError: config.stopOnError,
          fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
        }));
      } else {
        const found = cachedTemplates?.find((r: any) => r.id === templateId);
        if (found) {
          session.setSelectedTemplateId(found.id);
          session.setTemplateConfig(cloneTemplateConfig(found));
        }
      }
      defaultSessionModel.emitChange();
    };

    const createTemplateActions = () => {
      const actions: IAction[] = [
        createMenuAction({
          id: "template.select.auto",
          label: localize("da_template_auto_extraction", "Auto extraction"),
          left: createMenuItemLabel(localize("da_template_auto_extraction", "Auto extraction")),
          run: () => selectTemplate(AUTO_TEMPLATE_ID),
          selected: (selectedTemplateId || AUTO_TEMPLATE_ID) === AUTO_TEMPLATE_ID,
          tabIndex: 0,
          value: AUTO_TEMPLATE_ID,
        }),
      ];

      const templates = cachedTemplates ?? [];
      if (templates.length > 0) {
        actions.push(new Separator());
      }

      for (const template of templates) {
        const templateId = String(template.id ?? "");
        if (!templateId) {
          continue;
        }

        actions.push(createMenuAction({
          id: `template.select.${templateId}`,
          label: template.name || templateId,
          left: createMenuItemLabel(template.name || templateId),
          run: () => selectTemplate(templateId),
          rightAction: {
            icon: () => createLxIcon({ icon: lxEdit, size: 14 }),
            label: localize("da_template_edit", "Edit template"),
            onClick: () => editTemplate(template),
          },
          selected: selectedTemplateId === templateId,
          tabIndex: 0,
          value: templateId,
        }));
      }

      actions.push(
        new Separator(),
        createMenuAction({
          id: "template.create",
          label: localize("da_template_create_new", "Create new template..."),
          className: "template_select_menu_create",
          left: createMenuItemLabel(
            localize("da_template_create_new", "Create new template..."),
            () => createLxIcon({ icon: lxAdd, size: 14 }),
          ),
          run: createTemplate,
          tabIndex: 0,
        }),
      );

      return actions;
    };

    const templateSelectMenu = createMenuButton({
      label: selectedTemplateLabel,
      items: createTemplateActions,
      menuClassName: "template_select_menu",
      surfaceClassName: "template_select_menu_surface",
      triggerIcon: () => createLxIcon({ icon: lxChevronDown, size: 14 }),
    });

    selectContainer.append(templateSelectMenu.domNode);

    const isCustomTemplate = selectedTemplateId && selectedTemplateId !== AUTO_TEMPLATE_ID;
    if (isCustomTemplate) {
      const deleteBtn = createButton({
        label: localize("da_delete_template", "Delete template"),
        size: "sm",
        variant: "secondary",
      });
      deleteBtn.className = `${deleteBtn.className} template_button`;
      deleteBtn.addEventListener("click", async () => {
        if (!selectedTemplateId) return;
        const confirmMsg = localize("da_template_delete_confirm", "Delete template \"{name}\"?", { name: config.name });
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMsg)) {
          return;
        }
        try {
          await analysisStoreClient.deleteDeviceAnalysisTemplate(selectedTemplateId);
          if (cachedTemplates) {
            cachedTemplates = cachedTemplates.filter((t: any) => t.id !== selectedTemplateId);
          }
          session.setSelectedTemplateId(AUTO_TEMPLATE_ID);
          session.setTemplateConfig(createEmptyTemplateConfig({
            stopOnError: config.stopOnError,
            fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
          }));
          showToast(localize("da_template_deleted", "Template deleted"), "success");
          defaultSessionModel.emitChange();
        } catch (err) {
          showToast(localize("da_template_delete_failed", "Failed to delete template: {error}", { error: String(err) }), "error");
        }
      });
      selectContainer.append(deleteBtn);
    }

    dropdownRow.append(selectContainer);
    leftContent.append(dropdownRow);

    // Apply Buttons
    const applyActions = document.createElement("div");
    applyActions.className = "template_apply_actions";

    const applyAllBtn = createButton({
      label: localize("da_apply_template", "Apply Template"),
      size: "md",
      variant: "primary",
    });
    applyAllBtn.className = `${applyAllBtn.className} template_button`;
    applyAllBtn.addEventListener("click", () => {
      if (selectedTemplateId === AUTO_TEMPLATE_ID || !selectedTemplateId) {
        onTemplateApplied?.({ ...config, autoExtractionMode: true });
      } else {
        const validation = validateTemplateForApply(config, t as any);
        if (!validation.ok || !validation.normalized) {
          showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
          return;
        }
        onTemplateApplied?.({ ...validation.normalized });
      }
    });

    const applyNewBtn = createButton({
      label: localize("da_apply_new_files", "Apply New Files"),
      size: "md",
      variant: "secondary",
    });
    applyNewBtn.className = `${applyNewBtn.className} template_button`;
    applyNewBtn.addEventListener("click", () => {
      if (selectedTemplateId === AUTO_TEMPLATE_ID || !selectedTemplateId) {
        onTemplateAppliedIncremental?.({ ...config, autoExtractionMode: true });
      } else {
        const validation = validateTemplateForApply(config, t as any);
        if (!validation.ok || !validation.normalized) {
          showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
          return;
        }
        onTemplateAppliedIncremental?.({ ...validation.normalized });
      }
    });

    applyActions.append(applyAllBtn, applyNewBtn);
    leftContent.append(applyActions);

    // Import/Export template buttons
    const importExportRow = document.createElement("div");
    importExportRow.className = "template_button_row template_button_row--inset";

    const importBtn = createButton({
      label: localize("da_template_import_btn", "Import templates"),
      size: "sm",
      variant: "secondary",
    });
    importBtn.className = `${importBtn.className} template_button`;
    
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const payload = JSON.parse(raw);
        await importTemplates(payload, t, session);
      } catch (err) {
        showToast(localize("da_template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
      }
    });
    importBtn.addEventListener("click", () => fileInput.click());

    const exportBtn = createButton({
      label: localize("da_template_export_btn", "Export templates"),
      size: "sm",
      variant: "secondary",
    });
    exportBtn.className = `${exportBtn.className} template_button`;
    exportBtn.disabled = !config.name;
    exportBtn.addEventListener("click", () => {
      exportTemplate(config);
    });

    importExportRow.append(importBtn, exportBtn, fileInput);
    leftContent.append(importExportRow);

    // Divider
    const divider = document.createElement("div");
    divider.className = "h-[1px] bg-border my-1";
    leftContent.append(divider);

    // Toggles
    const togglesRow = document.createElement("div");
    togglesRow.className = "flex flex-col gap-2";

    const createToggleRowHelper = (labelText: string, checked: boolean, onToggle: (val: boolean) => void) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 text-xs text-text-secondary py-1";
      const lbl = document.createElement("span");
      lbl.textContent = labelText;
      const sw = createToggleSwitch(checked, onToggle);
      row.append(lbl, sw);
      return row;
    };

    togglesRow.append(
      createToggleRowHelper(
        localize("da_template_stop_on_error", "Stop at first invalid item"),
        config.stopOnError,
        (checked) => {
          session.setTemplateConfig({ ...config, stopOnError: checked });
        }
      ),
      createToggleRowHelper(
        localize("da_template_match_case", "Match field case"),
        config.fileNameMatchCaseSensitive,
        (checked) => {
          session.setTemplateConfig({ ...config, fileNameMatchCaseSensitive: checked });
        }
      )
    );
    leftContent.append(togglesRow);

    // Auto extract indicator
    if (selectedTemplateId === AUTO_TEMPLATE_ID || !selectedTemplateId) {
      const autoCard = document.createElement("div");
      autoCard.className = "p-3 rounded-lg bg-bg-page border border-dashed border-border flex flex-col gap-1.5";
      
      const autoTitle = document.createElement("div");
      autoTitle.className = "text-xs font-semibold text-text-primary";
      autoTitle.textContent = localize("da_auto_extract_title", "Smart auto extraction");

      const autoDesc = document.createElement("div");
      autoDesc.className = "text-[11px] text-text-secondary leading-relaxed";
      autoDesc.textContent = localize("da_auto_extract_desc", "The system analyzes imported file formats and extracts variables and related parameters automatically. Suitable for standard IV/CV data formats.");

      autoCard.append(autoTitle, autoDesc);
      leftContent.append(autoCard);
    }

    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    leftContent.append(spacer);
    } else {
    // Save Mode Form UI
    const form = document.createElement("div");
    form.className = "template_form flex flex-col gap-3";

    const handleInput = (fieldName: keyof TemplateConfig, value: string) => {
      session.setTemplateConfig({ ...session.templateConfig, [fieldName]: value });
    };

    form.append(
      createField({
        label: localize("da_template_name", "Template name"),
        name: "name",
        value: config.name,
        onInput: handleInput,
      }),
      createField({
        label: localize("da_template_x_start", "X Start"),
        name: "xDataStart",
        value: config.xDataStart,
        onInput: handleInput,
      }),
      createField({
        label: localize("da_template_x_end", "X End"),
        name: "xDataEnd",
        value: config.xDataEnd,
        onInput: handleInput,
      }),
      createField({
        label: localize("da_template_y_legend_start", "Legend Start"),
        name: "yLegendStart",
        value: config.yLegendStart,
        onInput: handleInput,
      }),
      createField({
        label: localize("da_template_y_legend_count", "Legend Count"),
        name: "yLegendCount",
        value: config.yLegendCount,
        onInput: handleInput,
      })
    );

    const meta = document.createElement("p");
    meta.className = "template_meta mt-1";
    meta.textContent = localize("da_template_file_count", "{count} file(s) imported", { count: rawData.length });
    form.append(meta);
    leftContent.append(form);

    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    leftContent.append(spacer);

    // Save controls
    const saveActions = document.createElement("div");
    saveActions.className = "flex flex-col gap-2 pt-2 shrink-0";

    const saveBtn = createButton({
      label: localize("da_save_template", "Save template"),
      size: "md",
      variant: "primary",
    });
    saveBtn.className = `${saveBtn.className} h-[38px] rounded-lg`;
    saveBtn.addEventListener("click", async () => {
      const name = config.name.trim();
      if (!name) {
        showToast(localize("da_template_name_required", "Please enter a template name."), "warning");
        return;
      }
      
      const validation = validateTemplateForSave(config, t as any);
      if (!validation.ok || !validation.normalized) {
        showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
        return;
      }

      try {
        const persistedTemplate = {
          ...validation.normalized,
          name,
        };
        const savedRaw = await analysisStoreClient.createDeviceAnalysisTemplate({
          ...persistedTemplate,
        });
        const saved = savedRaw as any;
        
        if (cachedTemplates) {
          cachedTemplates = [saved, ...cachedTemplates.filter((t: any) => t.id !== saved.id && toTemplateNameKey(t.name) !== toTemplateNameKey(saved.name))];
        } else {
          cachedTemplates = [saved];
        }

        session.setSelectedTemplateId(saved.id);
        session.setTemplateConfig(cloneTemplateConfig(saved));
        session.setTemplateMode("select");
        showToast(localize("da_template_saved", "Template saved"), "success");
        defaultSessionModel.emitChange();
      } catch (err) {
        showToast(localize("da_template_save_failed", "Failed to save template: {error}", { error: String(err) }), "error");
      }
    });

    const cancelBtn = createButton({
      label: localize("da_cancel", "Cancel"),
      size: "md",
      variant: "secondary",
    });
    cancelBtn.className = `${cancelBtn.className} border border-border h-[38px] rounded-lg`;
    cancelBtn.addEventListener("click", () => {
      session.setTemplateMode("select");
      if (selectedTemplateId && selectedTemplateId !== AUTO_TEMPLATE_ID && cachedTemplates) {
        const found = cachedTemplates.find((t: any) => t.id === selectedTemplateId);
        if (found) {
          session.setTemplateConfig(cloneTemplateConfig(found));
        }
      } else {
        session.setTemplateConfig(createEmptyTemplateConfig({
          stopOnError: config.stopOnError,
          fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
        }));
      }
      defaultSessionModel.emitChange();
    });

    saveActions.append(saveBtn, cancelBtn);
      leftContent.append(saveActions);
    }

    return leftContent;
  };

  const left = document.createElement("div");
  left.className = getCardClassName({
    className: "template_panel_card template_config_panel",
    variant: "fill",
  });
  left.append(createModeContent(templateMode));

  const preview = TemplateManagerPreviewWorkspace({
    containerRef,
    config,
    ensurePreviewRows,
    getPreviewRow,
    getPreviewRowsVersion,
    interactive: true,
    previewFile,
    previewStatus,
    setConfig,
    subscribePreviewRowsVersion,
    t: t as any,
    writeFieldFromPreview,
  });

  panel.append(DataPreviewArea({
    importPanel: importerElement ?? null,
    joinTableAndTemplateCards: true,
    tablePreview: preview,
    templatePanel: left,
  }));

  return panel;
};

const TemplateManager = (props: TemplateManagerProps): any =>
  createTemplateManager(props);

export default TemplateManager;
