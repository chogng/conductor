import { lxListUnordered, lxSave } from "cogicon";

import { createButton } from "src/cs/base/browser/ui/button/button";
import { createCogIcon } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import {
  getInputFieldClassName,
  getInputFieldState,
  getInputNativeClassName,
} from "src/cs/base/browser/ui/input/input";
import {
  getSwitchClassName,
  getSwitchDataAttributes,
  getSwitchStyle,
} from "src/cs/base/browser/ui/switch/switch";
import { TabView, type TabViewContent } from "src/cs/base/browser/ui/tabs/tabView";
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
import { apiService } from "src/cs/workbench/contrib/desktop/browser/apiService";
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

const createSwitch = (
  checked: boolean,
  onCheckedChange: (checked: boolean) => void,
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "switch";
  button.setAttribute("aria-checked", String(checked));
  for (const [name, value] of Object.entries(
    getSwitchDataAttributes({ checked, size: "sm" }),
  )) {
    if (value !== undefined) {
      button.setAttribute(name, String(value));
    }
  }
  button.className = getSwitchClassName({});
  Object.assign(button.style, getSwitchStyle({ size: "sm" }));
  button.addEventListener("click", () => onCheckedChange(!checked));
  const thumb = document.createElement("span");
  thumb.className = "ui-switch__thumb";
  thumb.setAttribute("aria-hidden", "true");
  button.append(thumb);
  return button;
};

const importTemplates = async (payload: any, t: TranslateFn, session: any) => {
  let entry = payload;
  if (payload && payload.source === "conductor") {
    entry = payload;
  }
  
  const draft = normalizeTemplateConfigRecord(entry);
  if (!draft.name) {
    showToast(t("da_template_import_invalid_format") || "Import failed: Invalid template name", "warning");
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
      const confirmMessage = `模板“${draft.name}”已存在。\n确定：改名为“${newName}”导入。\n取消：覆盖已有模板。`;
      const shouldRename = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(confirmMessage) : true;
      if (shouldRename) {
        draft.name = newName;
      } else {
        const confTemplate = cachedTemplates.find((t: any) => toTemplateNameKey(t.name) === nameKey);
        if (confTemplate && confTemplate.id) {
          try {
            await apiService.deleteDeviceAnalysisTemplate(confTemplate.id);
          } catch (err) {
            // Ignore delete conflict errors or proceed
          }
        }
      }
    }
  }

  const validation = validateTemplateForSave(draft, t as any);
  if (!validation.ok || !validation.normalized) {
    showToast(validation.message || "Invalid configuration", "warning");
    return;
  }

  try {
    const savedRaw = await apiService.createDeviceAnalysisTemplate({
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
    showToast(t("da_template_imported") || "模板导入成功", "success");
    defaultSessionModel.emitChange();
  } catch (err) {
    showToast(t("da_template_import_failed", { error: String(err) }) || "导入失败", "error");
  }
};

const exportTemplate = (config: TemplateConfig) => {
  if (!config.name) {
    showToast("Please select a template to export", "warning");
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
    apiService.getDeviceAnalysisTemplates().then((remote) => {
      cachedTemplates = Array.isArray(remote) ? remote : [];
      templatesLoading = false;
      defaultSessionModel.emitChange();
    }).catch((err) => {
      templatesLoading = false;
      showToast(t("da_loadTemplatesFailed", { error: err instanceof Error ? err.message : String(err) }), "error");
    });
  }

  const panel = document.createElement("div");
  panel.className = "template_manager";
  containerRef.current = panel;

  const createModeContent = (mode: "select" | "save"): HTMLElement => {
    const leftContent = document.createElement("div");
    leftContent.className = "template_config_panel_content flex flex-col gap-4 flex-1 min-h-0 overflow-auto";

    if (mode === "select") {
    // Dropdown row
    const dropdownRow = document.createElement("div");
    dropdownRow.className = "flex flex-col gap-1.5";

    const dropdownLabel = document.createElement("span");
    dropdownLabel.className = "text-xs font-medium text-text-secondary";
    dropdownLabel.textContent = t("da_template_select_label") || "选择模板";
    dropdownRow.append(dropdownLabel);

    const selectContainer = document.createElement("div");
    selectContainer.className = "flex items-center gap-2";

    const select = document.createElement("select");
    select.className = "dropdown-field dropdown-field--sm flex-1 h-[36px] rounded-lg border border-border px-2 text-sm bg-bg-page text-text-primary";
    
    const autoOption = document.createElement("option");
    autoOption.value = AUTO_TEMPLATE_ID;
    autoOption.textContent = t("da_template_auto_extraction") || "自动提取";
    select.append(autoOption);

    if (cachedTemplates) {
      for (const tRec of cachedTemplates) {
        const opt = document.createElement("option");
        opt.value = tRec.id || "";
        opt.textContent = tRec.name || "";
        select.append(opt);
      }
    }

    select.value = selectedTemplateId || AUTO_TEMPLATE_ID;
    select.addEventListener("change", () => {
      const val = select.value;
      if (val === AUTO_TEMPLATE_ID) {
        session.setSelectedTemplateId(AUTO_TEMPLATE_ID);
        session.setTemplateConfig(createEmptyTemplateConfig({
          stopOnError: config.stopOnError,
          fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
        }));
      } else {
        const found = cachedTemplates?.find((r: any) => r.id === val);
        if (found) {
          session.setSelectedTemplateId(found.id);
          session.setTemplateConfig(cloneTemplateConfig(found));
        }
      }
      defaultSessionModel.emitChange();
    });

    selectContainer.append(select);

    const isCustomTemplate = selectedTemplateId && selectedTemplateId !== AUTO_TEMPLATE_ID;
    if (isCustomTemplate) {
      const deleteBtn = createButton({
        label: t("da_delete_template") || "删除",
        size: "sm",
        variant: "secondary",
      });
      deleteBtn.className = `${deleteBtn.className} border border-border px-3 h-[36px] rounded-lg`;
      deleteBtn.addEventListener("click", async () => {
        if (!selectedTemplateId) return;
        const confirmMsg = `确定要删除模板“${config.name}”吗？`;
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMsg)) {
          return;
        }
        try {
          await apiService.deleteDeviceAnalysisTemplate(selectedTemplateId);
          if (cachedTemplates) {
            cachedTemplates = cachedTemplates.filter((t: any) => t.id !== selectedTemplateId);
          }
          session.setSelectedTemplateId(AUTO_TEMPLATE_ID);
          session.setTemplateConfig(createEmptyTemplateConfig({
            stopOnError: config.stopOnError,
            fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
          }));
          showToast(t("da_template_deleted") || "模板已删除", "success");
          defaultSessionModel.emitChange();
        } catch (err) {
          showToast(t("da_template_delete_failed", { error: String(err) }) || "删除失败", "error");
        }
      });
      selectContainer.append(deleteBtn);
    }

    dropdownRow.append(selectContainer);
    leftContent.append(dropdownRow);

    // Import/Export template buttons
    const importExportRow = document.createElement("div");
    importExportRow.className = "flex items-center gap-2";

    const importBtn = createButton({
      label: t("da_template_import") || "导入模板",
      size: "sm",
      variant: "secondary",
    });
    importBtn.className = `${importBtn.className} flex-1 border border-border h-[36px] rounded-lg`;
    
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
        showToast(t("da_template_import_failed", { error: String(err) }) || "导入失败", "error");
      }
    });
    importBtn.addEventListener("click", () => fileInput.click());

    const exportBtn = createButton({
      label: t("da_template_export") || "导出模板",
      size: "sm",
      variant: "secondary",
    });
    exportBtn.className = `${exportBtn.className} flex-1 border border-border h-[36px] rounded-lg`;
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
      const sw = createSwitch(checked, onToggle);
      row.append(lbl, sw);
      return row;
    };

    togglesRow.append(
      createToggleRowHelper(
        t("da_template_stop_on_error") || "首个无效即停止",
        config.stopOnError,
        (checked) => {
          session.setTemplateConfig({ ...config, stopOnError: checked });
          defaultSessionModel.emitChange();
        }
      ),
      createToggleRowHelper(
        t("da_template_match_case") || "字段区分大小写",
        config.fileNameMatchCaseSensitive,
        (checked) => {
          session.setTemplateConfig({ ...config, fileNameMatchCaseSensitive: checked });
          defaultSessionModel.emitChange();
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
      autoTitle.textContent = t("da_auto_extract_title") || "智能自动提取";

      const autoDesc = document.createElement("div");
      autoDesc.className = "text-[11px] text-text-secondary leading-relaxed";
      autoDesc.textContent = t("da_auto_extract_desc") || "系统将自动分析导入的文件格式，识别自变量、因变量并提取相关参数。适用于标准的 IV/CV 数据格式。";

      autoCard.append(autoTitle, autoDesc);
      leftContent.append(autoCard);
    }

    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    leftContent.append(spacer);

    // Apply Buttons
    const applyActions = document.createElement("div");
    applyActions.className = "flex flex-col gap-2 pt-2 shrink-0";

    const applyAllBtn = createButton({
      label: t("da_apply_template") || "应用到所有",
      size: "md",
      variant: "primary",
    });
    applyAllBtn.className = `${applyAllBtn.className} h-[38px] rounded-lg`;
    applyAllBtn.addEventListener("click", () => {
      if (selectedTemplateId === AUTO_TEMPLATE_ID || !selectedTemplateId) {
        onTemplateApplied?.({ ...config, autoExtractionMode: true });
      } else {
        const validation = validateTemplateForApply(config, t as any);
        if (!validation.ok || !validation.normalized) {
          showToast(validation.message || "Invalid configuration", "warning");
          return;
        }
        onTemplateApplied?.({ ...validation.normalized });
      }
    });

    const applyNewBtn = createButton({
      label: t("da_apply_new_files") || "仅新增文件",
      size: "md",
      variant: "secondary",
    });
    applyNewBtn.className = `${applyNewBtn.className} border border-border h-[38px] rounded-lg`;
    applyNewBtn.addEventListener("click", () => {
      if (selectedTemplateId === AUTO_TEMPLATE_ID || !selectedTemplateId) {
        onTemplateAppliedIncremental?.({ ...config, autoExtractionMode: true });
      } else {
        const validation = validateTemplateForApply(config, t as any);
        if (!validation.ok || !validation.normalized) {
          showToast(validation.message || "Invalid configuration", "warning");
          return;
        }
        onTemplateAppliedIncremental?.({ ...validation.normalized });
      }
    });

    applyActions.append(applyAllBtn, applyNewBtn);
    leftContent.append(applyActions);
    } else {
    // Save Mode Form UI
    const form = document.createElement("div");
    form.className = "template_form flex flex-col gap-3";

    const handleInput = (fieldName: keyof TemplateConfig, value: string) => {
      session.setTemplateConfig({ ...session.templateConfig, [fieldName]: value });
    };

    form.append(
      createField({
        label: t("da_template_name") || "模板名称",
        name: "name",
        value: config.name,
        onInput: handleInput,
      }),
      createField({
        label: t("da_template_x_start") || "X 起始",
        name: "xDataStart",
        value: config.xDataStart,
        onInput: handleInput,
      }),
      createField({
        label: t("da_template_x_end") || "X 结束",
        name: "xDataEnd",
        value: config.xDataEnd,
        onInput: handleInput,
      }),
      createField({
        label: t("da_template_y_legend_start") || "Y 传奇名称起始",
        name: "yLegendStart",
        value: config.yLegendStart,
        onInput: handleInput,
      }),
      createField({
        label: t("da_template_y_legend_count") || "Y 传奇行数",
        name: "yLegendCount",
        value: config.yLegendCount,
        onInput: handleInput,
      })
    );

    const meta = document.createElement("p");
    meta.className = "template_meta mt-1";
    meta.textContent = t("da_template_file_count", { count: rawData.length });
    form.append(meta);
    leftContent.append(form);

    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    leftContent.append(spacer);

    // Save controls
    const saveActions = document.createElement("div");
    saveActions.className = "flex flex-col gap-2 pt-2 shrink-0";

    const saveBtn = createButton({
      label: t("da_save_template") || "保存",
      size: "md",
      variant: "primary",
    });
    saveBtn.className = `${saveBtn.className} h-[38px] rounded-lg`;
    saveBtn.addEventListener("click", async () => {
      const name = config.name.trim();
      if (!name) {
        showToast(t("da_template_name_required") || "请输入模板名称", "warning");
        return;
      }
      
      const validation = validateTemplateForSave(config, t as any);
      if (!validation.ok || !validation.normalized) {
        showToast(validation.message || "Invalid configuration", "warning");
        return;
      }

      try {
        const persistedTemplate = {
          ...validation.normalized,
          name,
        };
        const savedRaw = await apiService.createDeviceAnalysisTemplate({
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
        showToast(t("da_template_saved") || "模板保存成功", "success");
        defaultSessionModel.emitChange();
      } catch (err) {
        showToast(t("da_template_save_failed", { error: String(err) }) || "保存失败", "error");
      }
    });

    const cancelBtn = createButton({
      label: t("da_cancel") || "取消",
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

  class TemplateModeTabView extends TabView<"select" | "save"> {
    protected createView(tabId: "select" | "save"): TabViewContent {
      return {
        element: createModeContent(tabId),
        dispose() {},
      };
    }
  }

  const modeTabs = new TemplateModeTabView({
    activeTabId: templateMode,
    className: "template_mode_tab_view",
    idBase: "template-mode",
    onDidChangeActiveTab: (tabId) => {
      session.setTemplateMode(tabId);
      if (tabId === "save" && (!selectedTemplateId || selectedTemplateId === AUTO_TEMPLATE_ID)) {
        session.setSelectedTemplateId(null);
        session.setTemplateConfig(createEmptyTemplateConfig({
          stopOnError: config.stopOnError,
          fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
        }));
      }
    },
    size: "sm",
    tabListClassName: "template_tab_container",
    tabs: [
      {
        icon: () => createCogIcon({ icon: lxListUnordered, size: 14 }),
        id: "select",
        label: t("da_template_select_mode") || "选择",
      },
      {
        icon: () => createCogIcon({ icon: lxSave, size: 14 }),
        id: "save",
        label: t("da_template_save_mode") || "保存",
      },
    ],
  });

  const left = document.createElement("div");
  left.className = "template_config_panel flex flex-col gap-3 min-h-0 h-full overflow-hidden p-3";
  left.append(modeTabs.element);

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
    tablePreview: preview,
    templatePanel: left,
  }));

  return panel;
};

const TemplateManager = (props: TemplateManagerProps): any =>
  createTemplateManager(props);

export default TemplateManager;
