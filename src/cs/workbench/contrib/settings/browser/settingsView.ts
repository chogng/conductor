import { localize } from "src/cs/nls";
import { addDisposableListener, append, EventType, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton, updateButton as updateActionButton } from "src/cs/base/browser/ui/button/button";
import { ActionViewItem } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  MODAL_BODY_SCROLL_CLASS,
  createModalCloseActionBar,
  getModalDialogClassName,
  getModalDialogId,
  getModalTitleId,
  MODAL_BACKDROP_CLASS,
  MODAL_OVERLAY_CLASS,
} from "src/cs/base/browser/ui/modal/modal";
import { createInputBox, type InputBox } from "src/cs/base/browser/ui/inputbox/inputBox";
import { InputBoxWidget, type IInputBoxWidgetItem } from "src/cs/base/browser/ui/inputbox/inputBoxWidget";
import { createSelectBox, type SelectBox, type SelectBoxOption } from "src/cs/base/browser/ui/selectBox/selectBox";
import Scrollbar from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import { SwitchWidget } from "src/cs/base/browser/ui/switch/switchWidget";
import { Action, type IAction } from "src/cs/base/common/actions";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/services/settings/common/fileNameMatching";
import type {
  TemplateSemanticAxisTendency,
  TemplateSemanticUnit,
  TemplateXAxisIntent,
} from "src/cs/workbench/services/settings/common/settings";
import type {
  BuiltinSemanticDomainPack,
} from "src/cs/workbench/services/dataResource/common/semanticLibrary";
import {
  createSettingsNavGroups,
  type SettingsSectionDefinition,
  type SettingsSectionId,
} from "src/cs/workbench/contrib/settings/browser/settingsLayout";
import { renderWorkbenchMarkdown } from "src/cs/workbench/browser/markdownRenderer";
import { readBundledUserGuideMarkdown } from "src/cs/workbench/contrib/settings/browser/userGuideReader";
import {
  getSettingsSearchWords,
  hasSettingsSearchQuery,
  normalizeSettingsSearchText,
  type SettingsSearchTerm,
} from "src/cs/workbench/contrib/settings/browser/settingsSearch";
import {
  SettingsTree,
  type SettingsTreeElementItem,
  type SettingsTreeItem,
  type SettingsTreeSection,
} from "src/cs/workbench/contrib/settings/browser/settingsTree";
import type { LanguagePreference } from "src/cs/base/common/platform";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import "src/cs/base/browser/ui/inputbox/inputBox.css";
import "src/cs/workbench/contrib/settings/browser/media/settingsView.css";

type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type OriginSettingsSectionProps = {
  currentPath: string;
  cleanupEnabled: boolean;
  cleanupFailedRetentionDays: number;
  cleanupKeepSuccessJobs: number;
  cleanupRunning: boolean;
  cleanupSaving: boolean;
  isConfigurable: boolean;
  isHealthCheckAvailable: boolean;
  isCleanupAvailable: boolean;
  isHealthChecking: boolean;
  isLoading: boolean;
  plotCommand: string;
  plotPostCommandsText: string;
  plotSaving: boolean;
  plotType: number;
  plotLineWidth: number;
  plotLegendFontSize: number | "";
  plotXyPairs: string;
  isSaving: boolean;
  onCheckHealth: () => Promise<void> | void;
  onChoosePath: () => Promise<void> | void;
  onCleanupEnabledChange: (enabled: boolean) => Promise<void> | void;
  onCleanupFailedRetentionDaysChange: (
    value: string | number,
  ) => Promise<void> | void;
  onCleanupKeepSuccessJobsChange: (
    value: string | number,
  ) => Promise<void> | void;
  onPlotCommandChange: (value: string) => Promise<void> | void;
  onPlotPostCommandsChange: (value: string) => Promise<void> | void;
  onPlotTypeChange: (value: string | number) => Promise<void> | void;
  onPlotLineWidthChange: (value: string | number) => Promise<void> | void;
  onPlotLegendFontSizeChange: (value: string | number) => Promise<void> | void;
  onPlotXyPairsChange: (value: string) => Promise<void> | void;
  onRunCleanupNow: () => Promise<void> | void;
};

type AppUpdateSettings = {
  currentVersion?: string | null;
  isAvailable: boolean;
};

type WindowCloseSettings = {
  behavior: "minimizeToTray" | "quit";
  isSaving: boolean;
  onBehaviorChange: (
    behavior: "minimizeToTray" | "quit",
  ) => Promise<void> | void;
};

type NumericDisplaySettings = {
  optimized: boolean;
  isSaving: boolean;
  onOptimizedChange: (optimized: boolean) => Promise<void> | void;
};

type TableTemplateVisualizationSettings = {
  enabled: boolean;
  isSaving: boolean;
  onEnabledChange: (enabled: boolean) => Promise<void> | void;
};

type AppearanceSettings = {
  backgroundColor: string;
  backgroundColorDefault: string;
  backgroundColorOptions: readonly string[];
  explorerBadgeColors: Readonly<Record<string, string>>;
  explorerBadgeColorLabels: readonly SelectOption[];
  explorerBadgeColorOptions: readonly SelectOption[];
  explorerDensity: string;
  explorerDensityOptions: readonly SelectOption[];
  isExplorerBadgeColorSaving: boolean;
  isExplorerBadgeSaving: boolean;
  isExplorerDensitySaving: boolean;
  isSaving: boolean;
  showExplorerBadges: boolean;
  transparentChrome: boolean;
  onBackgroundColorChange: (value: string) => Promise<void> | void;
  onBackgroundColorReset: () => Promise<void> | void;
  onExplorerBadgeColorChange: (badge: string, color: string) => Promise<void> | void;
  onExplorerBadgeVisibilityChange: (enabled: boolean) => Promise<void> | void;
  onExplorerDensityChange: (value: string) => Promise<void> | void;
  onTransparentChromeChange: (enabled: boolean) => Promise<void> | void;
};

type FileNameMatchingSettings = {
  fieldSeparators: string;
  isSaving: boolean;
  onFieldSeparatorsChange: (value: string) => Promise<void> | void;
};

type ChartDefaultSettings = {
  defaultYScaleForCf: "linear" | "log";
  defaultYScaleForCv: "linear" | "log";
  defaultYScaleForOutput: "linear" | "log";
  defaultYScaleForPv: "linear" | "log";
  defaultYScaleForTransfer: "linear" | "log";
  tickLabelFontSize: number | "";
  axisTitleFontSize: number | "";
  isSaving: boolean;
  onDefaultYScaleForCfChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForCvChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForOutputChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForPvChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForTransferChange: (value: string) => Promise<void> | void;
  onTickLabelFontSizeChange: (value: string | number) => Promise<void> | void;
  onAxisTitleFontSizeChange: (value: string | number) => Promise<void> | void;
};

type TemplateSettings = {
  activeTerms: readonly TemplateActiveSemanticTerm[];
  customTerms: readonly TemplateSemanticTerm[];
  axisOptions: readonly SelectOption[];
  builtinTerms: readonly TemplateBuiltinSemanticTerm[];
  builtinDomainPacks: readonly BuiltinSemanticDomainPack[];
  disabledDomainPackIds: readonly string[];
  disabledBuiltinTermIds: readonly string[];
  isSaving: boolean;
  onAddSemanticTerm: () => Promise<void> | void;
  onDisableBuiltinTerm: (id: string) => Promise<void> | void;
  onDisableDomainPack: (id: string) => Promise<void> | void;
  onEnableBuiltinTerm: (id: string) => Promise<void> | void;
  onEnableDomainPack: (id: string) => Promise<void> | void;
  onMoveXAxisIntent: (sourceIntent: TemplateXAxisIntent, targetIntent: TemplateXAxisIntent) => Promise<void> | void;
  onRemoveSemanticTerm: (id: string) => Promise<void> | void;
  pendingActionItemId: string | null;
  unitOptions: readonly SelectOption[];
  xAxisIntentPriority: readonly TemplateXAxisIntent[];
};

type TemplateActiveSemanticTerm =
  | (TemplateSemanticTerm & { readonly source: "custom" })
  | (TemplateBuiltinSemanticTerm & { readonly source: "builtin" });

type TemplateSemanticTerm = {
  readonly id: string;
  readonly term: string;
  readonly canonicalUnit?: TemplateSemanticUnit;
  readonly axisTendency: TemplateSemanticAxisTendency;
  readonly enabled: boolean;
};

type TemplateBuiltinSemanticTerm = Omit<TemplateSemanticTerm, "enabled"> & {
  readonly canonicalRole: string;
  readonly domainPackIds: readonly string[];
};

type SettingsViewProps = {
  appearanceSettings: AppearanceSettings;
  appUpdateSettings: AppUpdateSettings;
  chartDefaultSettings: ChartDefaultSettings;
  fileNameMatchingSettings: FileNameMatchingSettings;
  language: LanguagePreference;
  numericDisplaySettings: NumericDisplaySettings;
  tableTemplateVisualizationSettings: TableTemplateVisualizationSettings;
  templateSettings: TemplateSettings;
  onLanguageChange: (language: LanguagePreference) => Promise<void> | void;
  onNavigateBack: () => Promise<void> | void;
  onResetLayoutState: () => Promise<void> | void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => Promise<void> | void;
  originSettings: OriginSettingsSectionProps;
  windowCloseSettings: WindowCloseSettings;
};

export type { SettingsSectionId };

class SettingsResetActionViewItem extends ActionViewItem {
  constructor(action: IAction) {
    super(undefined, action, {
      className: "settings-reset-button",
      icon: true,
      label: false,
    });
  }

  protected override updateLabel(): void {
    if (!this.label) {
      return;
    }

    this.label.replaceChildren(createLxIcon({
      className: "settings-reset-button__icon",
      icon: LxIcon.refresh,
    }));
  }
}

export type SettingsViewOptions = SettingsViewProps & {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  fileNameFieldSeparatorsDraft: string;
  handleCheckForUpdates: () => void;
  handleShowReleaseNotes: () => void;
  originLegendFontSizeDraft: string;
  plotCommandDraft: string;
  postCommandsDraft: string;
  setActiveSettingsSection: (section: SettingsSectionId) => void;
  searchQuery: string;
  setAxisTitleFontSizeDraft: (value: string) => void;
  setFileNameFieldSeparatorsDraft: (value: string) => void;
  setOriginLegendFontSizeDraft: (value: string) => void;
  setPlotCommandDraft: (value: string) => void;
  setPostCommandsDraft: (value: string) => void;
  setTemplateSemanticTermDraft: (value: string) => void;
  setTemplateSemanticAxisDraft: (value: string) => void;
  setTemplateSemanticUnitDraft: (value: string) => void;
  setTickLabelFontSizeDraft: (value: string) => void;
  setSearchQuery: (value: string) => void;
  setXyPairsDraft: (value: string) => void;
  settingsSections: readonly SettingsSectionDefinition[];
  themeModeOptions: SelectOption[];
  templateSemanticTermDraft: string;
  templateSemanticAxisDraft: TemplateSemanticAxisTendency;
  templateSemanticUnitDraft: TemplateSemanticUnit | "";
  tickLabelFontSizeDraft: string;
  windowCloseBehaviorOptions: SelectOption[];
  xyPairsDraft: string;
  yScaleOptions: SelectOption[];
};

export type SettingsContentDescriptorId =
  | "general-preferences"
  | "chart-defaults"
  | "template-preferences"
  | "template-matching"
  | "template-library"
  | "template-semantic-library"
  | "appearance-preferences"
  | "origin-integration"
  | "about";

export type SettingsContentItemId =
  | "settings-language-item"
  | "settings-close-behavior-item"
  | "settings-numeric-display-item"
  | "settings-default-transfer-y-scale-item"
  | "settings-default-output-y-scale-item"
  | "settings-default-cv-y-scale-item"
  | "settings-default-cf-y-scale-item"
  | "settings-default-pv-y-scale-item"
  | "settings-chart-defaults-item"
  | "settings-table-template-visualization-item"
  | "settings-filename-matching-item"
  | "settings-template-domain-packs-item"
  | "settings-template-x-axis-priority-item"
  | "settings-template-semantic-library-header"
  | "settings-template-semantic-active-terms-item"
  | "settings-template-semantic-active-terms-list-item"
  | "settings-template-semantic-active-terms-input-item"
  | "settings-template-semantic-recommended-terms-item"
  | "settings-template-semantic-recommended-terms-list-item"
  | "settings-template-semantic-custom-form-item"
  | "settings-theme-item"
  | "settings-explorer-density-item"
  | "settings-explorer-badges-item"
  | "settings-explorer-badge-colors-item"
  | "settings-layout-item"
  | "settings-background-item"
  | "settings-transparent-chrome-item"
  | "settings-origin-path-item"
  | "settings-origin-cleanup-item"
  | "settings-origin-plot-item"
  | "settings-about-version-item"
  | "settings-release-notes-item"
  | "settings-user-guide-item"
  | "settings-app-update-item";

export type SettingsContentItemTarget = {
  readonly descriptorId: SettingsContentDescriptorId;
  readonly itemIds: readonly SettingsContentItemId[];
};

export type SettingsViewUpdateTarget =
  | { readonly type: "content" }
  | {
    readonly type: "partial";
    readonly descriptorIds: readonly SettingsContentDescriptorId[];
    readonly itemTargets: readonly SettingsContentItemTarget[];
  };

type SettingsContentDescriptor = {
  readonly id: SettingsContentDescriptorId;
  readonly order: number;
  readonly sectionId: SettingsSectionId;
};

type FieldOptions = {
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  value: string;
};

type TextInputOptions = {
  disabled?: boolean;
  id: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

type ActiveSettingsDocumentDialog = {
  readonly disposeStore: DisposableStore;
  readonly overlay: HTMLElement;
};

type SettingsDocumentDialogOptions = {
  readonly idBase: string;
  readonly title: string;
  readonly markdown: string;
};

type TemplateSemanticCustomFormWidgets = {
  readonly axisSelect: SelectBox<string>;
  readonly unitSelect: SelectBox<string>;
};

type LocalContentPatch = {
  readonly element: HTMLElement;
  readonly getSearchText: () => string | undefined;
  readonly treeItemId?: SettingsContentItemId;
  readonly update: () => void;
};

export class SettingsView {
  private readonly descriptorDisposables = new Map<SettingsContentDescriptorId, DisposableStore>();
  private readonly descriptorItemIds = new Map<SettingsContentDescriptorId, Set<SettingsContentItemId>>();
  private readonly renderedDescriptorIds = new Set<SettingsContentDescriptorId>();
  private readonly contentDisposables = new DisposableStore();
  private readonly itemDisposables = new Map<SettingsContentItemId, DisposableStore>();
  private readonly localContentPatches = new Map<SettingsContentItemId, LocalContentPatch>();
  private readonly treeItems = new Map<SettingsContentItemId, SettingsTreeItem>();
  private readonly templateSemanticActiveTermFields = new WeakMap<HTMLElement, InputBoxWidget>();
  private readonly templateSemanticCustomForms = new WeakMap<HTMLElement, TemplateSemanticCustomFormWidgets>();
  private readonly templateSemanticRecommendedTermButtons = new WeakMap<HTMLElement, Map<string, HTMLButtonElement>>();
  private readonly templateSemanticRecommendedTermEmptyMessages = new WeakMap<HTMLElement, HTMLElement>();
  private readonly root: HTMLElement;
  private readonly contentScroll = new Scrollbar({
    className: "settings-view-content-scroll",
    viewportClassName: "settings-view-content-scroll-viewport",
  });
  private contentElement: HTMLElement | null = null;
  private contentTree: SettingsTree | null = null;
  private activeDescriptorId: SettingsContentDescriptorId | null = null;
  private activeDescriptorDisposables: DisposableStore | null = null;
  private activeItemDisposables: DisposableStore | null = null;
  private activeTreeItemPatchIds: Set<SettingsContentItemId> | null = null;
  private options: SettingsViewOptions;
  private activeBadgeLabelValue = "transfer";
  private settingsDocumentDialog: ActiveSettingsDocumentDialog | null = null;

  constructor(container: HTMLElement, options: SettingsViewOptions) {
    this.root = document.createElement("section");
    this.root.className = "settings-view";
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  update(options: SettingsViewOptions, target: SettingsViewUpdateTarget): void {
    const current = this.options;
    const layoutChanged = current.language !== options.language ||
      !settingsSectionsEqual(current.settingsSections, options.settingsSections);
    this.options = options;
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));

    if (layoutChanged) {
      this.render();
      return;
    }

    if (
      current.activeSettingsSection !== options.activeSettingsSection ||
      current.searchQuery !== options.searchQuery
    ) {
      this.refreshContent();
      return;
    }

    if (target.type === "partial") {
      this.updateContentPatch(current, target);
      return;
    }

    this.refreshContent();
  }

  dispose(): void {
    this.closeSettingsDocumentDialog();
    this.clearDescriptorTemplates();
    this.contentDisposables.dispose();
    this.contentScroll.dispose();
    this.root.remove();
  }

  private render(): void {
    this.clearDescriptorTemplates();
    this.contentDisposables.clear();
    this.contentElement = null;
    reset(this.root);
    this.root.appendChild(this.createContentScroll());
    queueMicrotask(() => this.contentScroll.layout());
  }

  private refreshContent(): void {
    this.clearDescriptorTemplates();
    this.contentDisposables.clear();
    const nextContent = this.createContent();
    if (!this.contentElement) {
      this.contentElement = nextContent;
      this.contentScroll.viewport.replaceChildren(nextContent);
    }
    else {
      this.contentElement.className = nextContent.className;
      this.contentElement.replaceChildren(...Array.from(nextContent.childNodes));
    }
    queueMicrotask(() => this.contentScroll.layout());
  }

  private updateContentPatch(current: SettingsViewOptions, target: Extract<SettingsViewUpdateTarget, { readonly type: "partial" }>): void {
    const descriptorIds = new Set(target.descriptorIds);
    for (const descriptorId of descriptorIds) {
      this.updateContentDescriptor(descriptorId);
    }

    for (const itemTarget of target.itemTargets) {
      if (descriptorIds.has(itemTarget.descriptorId)) {
        continue;
      }
      this.updateContentItems(itemTarget);
    }

    this.updateSearchResults();
    queueMicrotask(() => this.contentScroll.layout());
  }

  private updateContentDescriptor(descriptorId: SettingsContentDescriptorId): void {
    const tree = this.contentTree;
    if (!tree || !this.renderedDescriptorIds.has(descriptorId)) {
      return;
    }

    const itemIds = new Set(this.descriptorItemIds.get(descriptorId) ?? []);
    const currentDisposables = this.collectDescriptorDisposables(descriptorId);
    const previousPatchIds = this.activeTreeItemPatchIds;
    this.activeTreeItemPatchIds = itemIds;
    try {
      tree.update(this.createVisibleContentTreeSections(false));
    }
    finally {
      this.activeTreeItemPatchIds = previousPatchIds;
      currentDisposables.dispose();
    }
  }

  private updateContentItems(target: SettingsContentItemTarget): void {
    const treeItemIds = this.updateLocalContentItems(target);
    if (treeItemIds.length === 0) {
      return;
    }

    this.updateSettingsTreeItems({
      descriptorId: target.descriptorId,
      itemIds: treeItemIds,
    });
  }

  private updateLocalContentItems(target: SettingsContentItemTarget): readonly SettingsContentItemId[] {
    if (target.itemIds.length === 0) {
      return [];
    }

    const patches: Array<{ readonly itemId: SettingsContentItemId; readonly patch: LocalContentPatch }> = [];
    const treeItemIds: SettingsContentItemId[] = [];
    for (const itemId of target.itemIds) {
      const patch = this.localContentPatches.get(itemId);
      if (!patch || !patch.element.isConnected) {
        treeItemIds.push(itemId);
        continue;
      }
      patches.push({ itemId, patch });
    }

    const searchItemIds = new Set<SettingsContentItemId>();
    for (const { itemId, patch } of patches) {
      patch.update();
      searchItemIds.add(patch.treeItemId ?? itemId);
    }

    for (const itemId of searchItemIds) {
      this.updateLocalContentSearchText(itemId);
    }
    return treeItemIds;
  }

  private updateLocalContentSearchText(itemId: SettingsContentItemId): void {
    const item = this.treeItems.get(itemId);
    if (!item) {
      return;
    }

    const patch = this.localContentPatches.get(itemId);
    const searchText = normalizeSettingsSearchText(patch?.getSearchText() ?? item.searchText);
    this.treeItems.set(itemId, updateSettingsTreeItemSearchText(item, searchText));
    this.contentTree?.updateItemSearchText(itemId, searchText);
  }

  private updateSettingsTreeItems(target: SettingsContentItemTarget): void {
    const tree = this.contentTree;
    if (!tree || !this.renderedDescriptorIds.has(target.descriptorId)) {
      return;
    }

    const itemIds = new Set(target.itemIds);
    const currentDisposables = target.itemIds.map(itemId => this.collectContentItemDisposables(itemId));
    const previousPatchIds = this.activeTreeItemPatchIds;
    this.activeTreeItemPatchIds = itemIds;
    try {
      tree.updateItems(this.createVisibleContentTreeSections(false), target.itemIds);
    }
    finally {
      this.activeTreeItemPatchIds = previousPatchIds;
    }
    for (const disposables of currentDisposables) {
      disposables.dispose();
    }
  }

  private updateSearchResults(): void {
    if (!this.contentElement || !hasSettingsSearchQuery(this.options.searchQuery)) {
      return;
    }

    for (const empty of Array.from(this.contentElement.querySelectorAll<HTMLElement>(".settings-search-empty"))) {
      empty.remove();
    }

    const resultCount = this.contentTree?.filterSearchResults(getSettingsSearchWords(this.options.searchQuery)) ?? 0;
    if (resultCount === 0) {
      this.contentElement.appendChild(this.createEmptySearchResults());
    }
  }

  private createContentDescriptorSections(descriptor: SettingsContentDescriptor): readonly SettingsTreeSection[] {
    const disposables = new DisposableStore();
    const previousDisposables = this.activeDescriptorDisposables;
    const previousDescriptorId = this.activeDescriptorId;
    this.activeDescriptorDisposables = disposables;
    this.activeDescriptorId = descriptor.id;
    try {
      const sections = this.createDescriptorTreeSections(descriptor.id);
      this.descriptorDisposables.set(descriptor.id, disposables);
      this.renderedDescriptorIds.add(descriptor.id);
      return sections;
    }
    finally {
      this.activeDescriptorDisposables = previousDisposables;
      this.activeDescriptorId = previousDescriptorId;
    }
  }

  private clearDescriptorTemplates(): void {
    const descriptorIds = new Set<SettingsContentDescriptorId>([
      ...this.descriptorDisposables.keys(),
      ...this.descriptorItemIds.keys(),
      ...this.renderedDescriptorIds,
    ]);
    for (const descriptorId of descriptorIds) {
      this.collectDescriptorDisposables(descriptorId).dispose();
    }
    this.renderedDescriptorIds.clear();
    this.contentTree = null;
  }

  private registerContentDisposable<T extends IDisposable>(disposable: T): T {
    const disposables = this.activeItemDisposables ?? this.activeDescriptorDisposables ?? this.contentDisposables;
    return disposables.add(disposable);
  }

  private registerLocalContentPatch(itemId: SettingsContentItemId, patch: LocalContentPatch): void {
    this.localContentPatches.set(itemId, patch);
    this.registerContentDisposable({
      dispose: () => {
        if (this.localContentPatches.get(itemId)?.element === patch.element) {
          this.localContentPatches.delete(itemId);
        }
      },
    });
  }

  private collectDescriptorDisposables(descriptorId: SettingsContentDescriptorId): DisposableStore {
    const disposables = new DisposableStore();
    const itemIds = this.descriptorItemIds.get(descriptorId);
    if (itemIds) {
      for (const itemId of itemIds) {
        disposables.add(this.collectContentItemDisposables(itemId));
      }
    }
    this.descriptorItemIds.delete(descriptorId);
    const descriptorDisposables = this.descriptorDisposables.get(descriptorId);
    if (descriptorDisposables) {
      disposables.add(descriptorDisposables);
      this.descriptorDisposables.delete(descriptorId);
    }
    return disposables;
  }

  private collectContentItemDisposables(itemId: SettingsContentItemId): DisposableStore {
    const disposables = new DisposableStore();
    const itemDisposables = this.itemDisposables.get(itemId);
    if (itemDisposables) {
      disposables.add(itemDisposables);
      this.itemDisposables.delete(itemId);
    }
    this.localContentPatches.delete(itemId);
    this.treeItems.delete(itemId);
    return disposables;
  }

  private withActiveDescriptor<T>(descriptorId: SettingsContentDescriptorId, create: () => T): T {
    const previousDescriptorId = this.activeDescriptorId;
    this.activeDescriptorId = descriptorId;
    try {
      return create();
    }
    finally {
      this.activeDescriptorId = previousDescriptorId;
    }
  }

  private createContentItem<T>(itemId: SettingsContentItemId, create: () => T): T {
    const disposables = new DisposableStore();
    const previousDisposables = this.activeItemDisposables;
    this.activeItemDisposables = disposables;
    try {
      const value = create();
      this.itemDisposables.set(itemId, disposables);
      if (this.activeDescriptorId) {
        let itemIds = this.descriptorItemIds.get(this.activeDescriptorId);
        if (!itemIds) {
          itemIds = new Set();
          this.descriptorItemIds.set(this.activeDescriptorId, itemIds);
        }
        itemIds.add(itemId);
      }
      return value;
    }
    finally {
      this.activeItemDisposables = previousDisposables;
    }
  }

  private createSettingsTreeRowItem(options: {
    readonly id: SettingsContentItemId;
    readonly content: HTMLElement;
    readonly description?: string;
    readonly groupId?: string;
    readonly searchText?: string;
    readonly title: string;
  }): SettingsTreeElementItem {
    const current = this.getReusableTreeItem(options.id, "element");
    if (current) {
      return current;
    }

    return this.createContentItem(options.id, () => {
      const element = cell(options.id, "settings-cell-row");
      const row = div("settings-row");
      const labelElement = div(options.description ? "settings-row-item settings-row-leading settings-heading" : "settings-row-item settings-row-leading");
      labelElement.appendChild(title(options.title));
      if (options.description) {
        labelElement.appendChild(text("p", "settings-description", options.description));
      }
      row.append(labelElement, div("settings-row-item settings-row-trailing", options.content));
      element.appendChild(row);

      const item: SettingsTreeElementItem = {
        kind: "element",
        element,
        groupId: options.groupId,
        id: options.id,
        searchText: normalizeSettingsSearchText(options.title, options.description, options.searchText),
      };
      this.treeItems.set(options.id, item);
      return item;
    });
  }

  private createSettingsTreeElementItem(options: {
    readonly id: SettingsContentItemId;
    readonly createElement: () => HTMLElement;
    readonly groupId?: string;
    readonly searchText?: string;
  }): SettingsTreeElementItem {
    const current = this.getReusableTreeItem(options.id, "element");
    if (current) {
      return current;
    }

    return this.createContentItem(options.id, () => {
      const item: SettingsTreeElementItem = {
        kind: "element",
        element: options.createElement(),
        groupId: options.groupId,
        id: options.id,
        searchText: options.searchText,
      };
      this.treeItems.set(options.id, item);
      return item;
    });
  }

  private getReusableTreeItem<TKind extends SettingsTreeItem["kind"]>(
    itemId: SettingsContentItemId,
    kind: TKind,
  ): Extract<SettingsTreeItem, { readonly kind: TKind }> | null {
    if (!this.activeTreeItemPatchIds || this.activeTreeItemPatchIds.has(itemId)) {
      return null;
    }

    const item = this.treeItems.get(itemId);
    if (item?.kind !== kind) {
      return null;
    }

    return item as Extract<SettingsTreeItem, { readonly kind: TKind }>;
  }

  private createContentScroll(): HTMLElement {
    this.contentElement = this.createContent();
    this.contentScroll.viewport.replaceChildren(this.contentElement);
    return this.contentScroll.element;
  }

  private createContent(): HTMLElement {
    const content = div("settings-view-content");
    const queryWords = getSettingsSearchWords(this.options.searchQuery);
    if (queryWords.length > 0) {
      this.renderSearchResults(content, queryWords);
      return content;
    }

    this.renderSettingsContent(content, [this.options.activeSettingsSection]);
    return content;
  }

  private renderSearchResults(container: HTMLElement, queryWords: readonly string[]): void {
    container.classList.add("settings-view-content--search");
    this.renderSettingsContent(container, this.options.settingsSections.map(section => section.id));

    const resultCount = this.contentTree?.filterSearchResults(queryWords) ?? 0;
    if (resultCount === 0) {
      container.appendChild(this.createEmptySearchResults());
    }
  }

  private createEmptySearchResults(): HTMLElement {
    return div(
      "settings-search-empty",
      title(localize("settings.search.noResultsTitle", "No settings found")),
      text("p", "settings-description", localize("settings.search.noResultsDescription", "Try a different search term.")),
    );
  }

  private renderSettingsContent(container: HTMLElement, sectionIds: readonly SettingsSectionId[]): void {
    const tree = this.registerContentDisposable(new SettingsTree());
    tree.update(this.createContentTreeSections(this.getContentDescriptorsForSections(sectionIds), true));
    this.contentTree = tree;
    container.appendChild(tree.element);
  }

  private createVisibleContentTreeSections(initializeDescriptors: boolean): readonly SettingsTreeSection[] {
    const sectionIds = hasSettingsSearchQuery(this.options.searchQuery)
      ? this.options.settingsSections.map(section => section.id)
      : [this.options.activeSettingsSection];
    return this.createContentTreeSections(this.getContentDescriptorsForSections(sectionIds), initializeDescriptors);
  }

  private getContentDescriptorsForSections(sectionIds: readonly SettingsSectionId[]): readonly SettingsContentDescriptor[] {
    const descriptors = this.createContentDescriptors();
    const result: SettingsContentDescriptor[] = [];
    for (const sectionId of sectionIds) {
      result.push(...descriptors
        .filter(candidate => candidate.sectionId === sectionId)
        .sort((first, second) => first.order - second.order));
    }
    return result;
  }

  private createContentTreeSections(
    descriptors: readonly SettingsContentDescriptor[],
    initializeDescriptors: boolean,
  ): readonly SettingsTreeSection[] {
    const sections: SettingsTreeSection[] = [];
    for (const descriptor of descriptors) {
      const descriptorSections = initializeDescriptors
        ? this.createContentDescriptorSections(descriptor)
        : this.withActiveDescriptor(descriptor.id, () => {
          this.renderedDescriptorIds.add(descriptor.id);
          return this.createDescriptorTreeSections(descriptor.id);
        });
      sections.push(...descriptorSections);
    }
    return sections;
  }

  private createContentDescriptors(): readonly SettingsContentDescriptor[] {
    return [
      {
        id: "general-preferences",
        order: 0,
        sectionId: "general",
      },
      {
        id: "chart-defaults",
        order: 10,
        sectionId: "general",
      },
      {
        id: "template-preferences",
        order: 0,
        sectionId: "template",
      },
      {
        id: "template-matching",
        order: 10,
        sectionId: "template",
      },
      {
        id: "template-library",
        order: 20,
        sectionId: "template",
      },
      {
        id: "template-semantic-library",
        order: 30,
        sectionId: "template",
      },
      {
        id: "appearance-preferences",
        order: 0,
        sectionId: "appearance",
      },
      {
        id: "origin-integration",
        order: 0,
        sectionId: "origin",
      },
      {
        id: "about",
        order: 0,
        sectionId: "about",
      },
    ];
  }

  private getSectionLabel(sectionId: SettingsSectionId): string {
    const section = this.options.settingsSections.find(candidate => candidate.id === sectionId);
    if (!section) {
      throw new Error(`Settings section ${sectionId} is not registered.`);
    }
    return section.label;
  }

  private createDescriptorTreeSections(descriptorId: SettingsContentDescriptorId): readonly SettingsTreeSection[] {
    switch (descriptorId) {
      case "general-preferences":
        return this.createGeneralSettingsTree();
      case "chart-defaults":
        return this.createChartSettingsTree(this.options.chartDefaultSettings);
      case "template-preferences":
        return this.createTemplateSettingsTree();
      case "template-matching":
        return this.createTemplateMatchingSettingsTree();
      case "template-library":
        return this.createTemplateLibrarySettingsTree();
      case "template-semantic-library":
        return this.createTemplateSemanticLibrarySettingsTree();
      case "appearance-preferences":
        return this.createAppearanceSettingsTree();
      case "origin-integration":
        return this.createOriginSettingsTree();
      case "about":
        return this.createAboutSettingsTree();
    }

    throw new Error(`Settings descriptor ${descriptorId} does not own a settings tree.`);
  }

  private createGeneralSettingsTree(): readonly SettingsTreeSection[] {
    const languageOptions = [
      { value: "system", label: localize("settings.language.system", "System") },
      { value: "zh", label: localize("settings.language.zh", "Chinese") },
      { value: "en", label: localize("settings.language.en", "English") },
    ];
    return [
      {
        id: "settings-general-section",
        title: this.getSectionLabel("general"),
        items: [
          this.createSettingsTreeRowItem({
            id: "settings-language-item",
            title: localize("settings.language.title", "Language"),
            description: localize("settings.language.description", "Choose the display language used by the app."),
            searchText: normalizeSettingsSearchText(optionLabels(languageOptions)),
            content: this.createLocalSelectControl("settings-language-item", () => ({
              id: "settings-language-dropdown",
              value: this.options.language,
              onChange: value => {
                if (value === "system" || value === "zh" || value === "en") {
                  void this.options.onLanguageChange(value);
                }
              },
              options: languageOptions,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-close-behavior-item",
            title: localize("settings.closeBehavior.title", "Close Window"),
            description: localize("settings.closeBehavior.description", "Choose what happens when the main window is closed."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.windowCloseBehaviorOptions)),
            content: this.createLocalSelectControl("settings-close-behavior-item", () => ({
              id: "settings-close-behavior-dropdown",
              value: this.options.windowCloseSettings.behavior,
              onChange: value => {
                if (value === "minimizeToTray" || value === "quit") {
                  void this.options.windowCloseSettings.onBehaviorChange(value);
                }
              },
              options: this.options.windowCloseBehaviorOptions,
              disabled: this.options.windowCloseSettings.isSaving,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-numeric-display-item",
            title: localize("settings.numericDisplay.title", "优化表格数值显示"),
            description: localize("settings.numericDisplay.description", "优化科学计数法以合适小数位显示以更好的预览"),
            content: this.createLocalSwitchControl({
              itemId: "settings-numeric-display-item",
              ariaLabel: localize("settings.numericDisplay.title", "优化表格数值显示"),
              getChecked: () => this.options.numericDisplaySettings.optimized,
              id: "settings-numeric-display-toggle",
              onChange: checked => {
                void this.options.numericDisplaySettings.onOptimizedChange(checked);
              },
            }),
          }),
        ],
      },
    ];
  }

  private createTemplateSettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-template-section",
        title: this.getSectionLabel("template"),
        items: [
          this.createSettingsTreeRowItem({
            id: "settings-table-template-visualization-item",
            title: localize("settings.tableTemplateVisualization.title", "Template Visualization"),
            description: localize("settings.tableTemplateVisualization.description", "Show the current template ranges on the table preview."),
            content: this.createLocalSwitchControl({
              itemId: "settings-table-template-visualization-item",
              ariaLabel: localize("settings.tableTemplateVisualization.title", "Template Visualization"),
              getChecked: () => this.options.tableTemplateVisualizationSettings.enabled,
              getDisabled: () => this.options.tableTemplateVisualizationSettings.isSaving,
              id: "settings-table-template-visualization-toggle",
              onChange: checked => {
                void this.options.tableTemplateVisualizationSettings.onEnabledChange(checked);
              },
            }),
          }),
        ],
      },
    ];
  }

  private createTemplateMatchingSettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-template-matching-section",
        title: localize("settings.template.matching.sectionTitle", "Template Matching"),
        items: [
          this.createSettingsTreeElementItem({
            id: "settings-filename-matching-item",
            createElement: () => this.createFileNameMatching(this.options.fileNameMatchingSettings),
            searchText: this.getFileNameMatchingSearchText(),
          }),
        ],
      },
    ];
  }

  private createTemplateLibrarySettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-template-library-section",
        title: localize("settings.template.library.sectionTitle", "Template Library"),
        items: [
          this.createSettingsTreeElementItem({
            id: "settings-template-domain-packs-item",
            createElement: () => this.createTemplateDomainPacks(this.options.templateSettings),
            searchText: this.getTemplateDomainPacksSearchText(this.options.templateSettings),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-template-x-axis-priority-item",
            createElement: () => this.createXAxisIntentPriority(this.options.templateSettings),
            searchText: this.getTemplateXAxisIntentPrioritySearchText(this.options.templateSettings),
          }),
        ],
      },
    ];
  }

  private createTemplateSemanticLibrarySettingsTree(): readonly SettingsTreeSection[] {
    const settings = this.options.templateSettings;
    const groupId = "settings-template-semantic-library";
    return [
      {
        id: "settings-template-semantic-library-section",
        items: [
          this.createSettingsTreeElementItem({
            id: "settings-template-semantic-library-header",
            groupId,
            createElement: () => this.createTemplateSemanticLibraryHeader(),
            searchText: this.getTemplateSemanticLibraryHeaderSearchText(),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-template-semantic-active-terms-item",
            groupId,
            createElement: () => this.createTemplateSemanticActiveTerms(settings),
            searchText: this.getTemplateSemanticActiveTermsSearchText(),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-template-semantic-recommended-terms-item",
            groupId,
            createElement: () => this.createTemplateSemanticRecommendedTerms(settings),
            searchText: this.getTemplateSemanticRecommendedTermsSearchText(settings),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-template-semantic-custom-form-item",
            groupId,
            createElement: () => this.createTemplateSemanticCustomForm(settings),
            searchText: this.getTemplateSemanticCustomFormSearchText(settings),
          }),
        ],
      },
    ];
  }

  private createTemplateDomainPacks(settings: TemplateSettings): HTMLElement {
    const container = cell("settings-template-domain-packs-item", "settings-cell-block");
    const titleText = localize("settings.template.domainPacks.title", "Domain Packs");
    const description = localize("settings.template.domainPacks.description", "Built-in domain packs scope title and marker evidence before Review builds binding candidates.");
    container.appendChild(headingBlock(titleText, description));

    const disabledIds = new Set(settings.disabledDomainPackIds);
    const activePacks = settings.builtinDomainPacks.filter(pack => !disabledIds.has(pack.id));
    const disabledPacks = settings.builtinDomainPacks.filter(pack => disabledIds.has(pack.id));

    const activeGroup = div("settings-template-library-group");
    activeGroup.appendChild(text("p", "settings-template-subtitle", localize("settings.template.domainPacks.activeTitle", "Active packs")));
    const activeList = div("settings-template-domain-pack-list");
    for (const pack of activePacks) {
      activeList.appendChild(this.createTemplateDomainPackBlock(settings, pack, "enabled"));
    }
    activeGroup.appendChild(activeList);

    const disabledGroup = div("settings-template-library-group");
    disabledGroup.appendChild(text("p", "settings-template-subtitle", localize("settings.template.domainPacks.disabledTitle", "Disabled packs")));
    const disabledList = div("settings-template-domain-pack-list");
    if (!disabledPacks.length) {
      disabledList.appendChild(text("p", "settings-template-empty", localize("settings.template.domainPacks.noDisabled", "No disabled packs.")));
    }
    for (const pack of disabledPacks) {
      disabledList.appendChild(this.createTemplateDomainPackBlock(settings, pack, "disabled"));
    }
    disabledGroup.appendChild(disabledList);

    container.append(activeGroup, disabledGroup);
    return container;
  }

  private createTemplateDomainPackBlock(
    settings: TemplateSettings,
    pack: BuiltinSemanticDomainPack,
    state: "enabled" | "disabled",
  ): HTMLElement {
    const block = div("settings-template-domain-pack");
    block.dataset.state = state;
    const body = div("settings-template-domain-pack-body");
    const header = div(
      "settings-template-domain-pack-header",
      text("span", "settings-template-block-title", pack.label),
      text("span", "settings-template-domain-pack-kind", formatDomainPackKind(pack.kind)),
    );
    const meta = text(
      "p",
      "settings-template-block-meta settings-template-domain-pack-description",
      pack.description,
    );
    const details = div("settings-template-domain-pack-details");
    details.append(
      this.createTemplateDomainPackDetail(
        localize("settings.template.domainPacks.intentPriors", "Intent"),
        pack.intentPriors.map(formatXAxisIntent),
      ),
      this.createTemplateDomainPackDetail(
        localize("settings.template.domainPacks.rolePriors", "Roles"),
        pack.rolePriors,
      ),
      this.createTemplateDomainPackDetail(
        localize("settings.template.domainPacks.patterns", "Patterns"),
        pack.patterns,
      ),
    );
    body.append(header, meta, details);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "settings-template-icon-button";
    toggleButton.disabled = settings.isSaving;
    toggleButton.title = state === "enabled"
      ? localize("settings.template.domainPacks.disableTitle", "Disable this domain pack for Review")
      : localize("settings.template.domainPacks.enableTitle", "Enable this domain pack for Review");
    toggleButton.setAttribute("aria-label", state === "enabled"
      ? localize("settings.template.domainPacks.disable", "Disable domain pack {label}", { label: pack.label })
      : localize("settings.template.domainPacks.enable", "Enable domain pack {label}", { label: pack.label }));
    toggleButton.appendChild(createLxIcon({
      className: "settings-template-icon",
      icon: state === "enabled" ? LxIcon.close : LxIcon.add,
      size: 14,
    }));
    toggleButton.addEventListener("click", () => {
      if (state === "enabled") {
        void settings.onDisableDomainPack(pack.id);
        return;
      }
      void settings.onEnableDomainPack(pack.id);
    });

    block.append(
      createLxIcon({ className: "settings-template-domain-pack-icon", icon: LxIcon.summary, size: 16 }),
      body,
      toggleButton,
    );
    return block;
  }

  private createTemplateDomainPackDetail(labelText: string, values: readonly string[]): HTMLElement {
    const row = div("settings-template-domain-pack-detail");
    row.appendChild(text("span", "settings-template-domain-pack-detail-label", labelText));
    const chips = div("settings-template-domain-pack-detail-values");
    for (const value of values) {
      chips.appendChild(text("span", "settings-template-domain-pack-detail-chip", value));
    }
    row.appendChild(chips);
    return row;
  }

  private createXAxisIntentPriority(settings: TemplateSettings): HTMLElement {
    const container = cell("settings-template-x-axis-priority-item", "settings-cell-block");
    const titleText = localize("settings.template.xAxisPriority.title", "X Axis Intent Priority");
    const description = localize("settings.template.xAxisPriority.description", "Drag intent blocks to decide which X role wins when one table exposes several legal X sequences.");
    container.appendChild(headingBlock(titleText, description));

    const list = div("settings-template-block-list");
    for (const intent of settings.xAxisIntentPriority) {
      const block = div("settings-template-block settings-template-block--intent");
      block.draggable = !settings.isSaving;
      block.dataset.intent = intent;
      block.tabIndex = 0;
      block.append(
        createLxIcon({ className: "settings-template-block-handle", icon: LxIcon.listUnordered, size: 14 }),
        text("span", "settings-template-block-title", formatXAxisIntent(intent)),
        text("span", "settings-template-block-meta", intent),
      );
      block.addEventListener("dragstart", event => {
        event.dataTransfer?.setData("application/x-conductor-template-intent", intent);
      });
      block.addEventListener("dragover", event => {
        event.preventDefault();
      });
      block.addEventListener("drop", event => {
        event.preventDefault();
        const source = event.dataTransfer?.getData("application/x-conductor-template-intent");
        if (isTemplateXAxisIntent(source)) {
          void settings.onMoveXAxisIntent(source, intent);
        }
      });
      list.appendChild(block);
    }

    container.appendChild(list);
    return container;
  }

  private createTemplateSemanticLibraryHeader(): HTMLElement {
    const container = cell("settings-template-semantic-library-header", "settings-cell-block");
    const titleText = localize("settings.template.semantic.title", "Semantic Library");
    const description = localize("settings.template.semantic.description", "Terms that can slice template automatically.");
    container.appendChild(headingBlock(titleText, description));
    return container;
  }

  private createTemplateSemanticActiveTerms(settings: TemplateSettings): HTMLElement {
    const container = cell("settings-template-semantic-active-terms-item", "settings-cell-block");
    this.updateTemplateSemanticActiveTerms(container, settings);
    this.registerLocalContentPatch("settings-template-semantic-active-terms-item", {
      element: container,
      getSearchText: () => this.getTemplateSemanticActiveTermsSearchText(),
      update: () => this.updateTemplateSemanticActiveTerms(container, this.options.templateSettings),
    });
    this.registerLocalContentPatch("settings-template-semantic-active-terms-list-item", {
      element: container,
      treeItemId: "settings-template-semantic-active-terms-item",
      getSearchText: () => this.getTemplateSemanticActiveTermsSearchText(),
      update: () => this.updateTemplateSemanticActiveTermItems(container, this.options.templateSettings),
    });
    this.registerLocalContentPatch("settings-template-semantic-active-terms-input-item", {
      element: container,
      treeItemId: "settings-template-semantic-active-terms-item",
      getSearchText: () => this.getTemplateSemanticActiveTermsSearchText(),
      update: () => this.updateTemplateSemanticActiveTermInput(container, this.options.templateSettings),
    });
    return container;
  }

  private createTemplateSemanticRecommendedTerms(settings: TemplateSettings): HTMLElement {
    const container = cell("settings-template-semantic-recommended-terms-item", "settings-cell-block");
    this.updateTemplateSemanticRecommendedTerms(container, settings);
    this.registerLocalContentPatch("settings-template-semantic-recommended-terms-item", {
      element: container,
      getSearchText: () => this.getTemplateSemanticRecommendedTermsSearchText(this.options.templateSettings),
      update: () => this.updateTemplateSemanticRecommendedTerms(container, this.options.templateSettings),
    });
    this.registerLocalContentPatch("settings-template-semantic-recommended-terms-list-item", {
      element: container,
      treeItemId: "settings-template-semantic-recommended-terms-item",
      getSearchText: () => this.getTemplateSemanticRecommendedTermsSearchText(this.options.templateSettings),
      update: () => this.updateTemplateSemanticRecommendedTerms(container, this.options.templateSettings),
    });
    return container;
  }

  private createTemplateSemanticCustomForm(settings: TemplateSettings): HTMLElement {
    const container = cell("settings-template-semantic-custom-form-item", "settings-cell-block");
    this.updateTemplateSemanticCustomForm(container, settings);
    this.registerLocalContentPatch("settings-template-semantic-custom-form-item", {
      element: container,
      getSearchText: () => this.getTemplateSemanticCustomFormSearchText(this.options.templateSettings),
      update: () => this.updateTemplateSemanticCustomForm(container, this.options.templateSettings),
    });
    return container;
  }

  private getTemplateSemanticLibraryHeaderSearchText(): string {
    return normalizeSettingsSearchText(
      localize("settings.template.semantic.title", "Semantic Library"),
      localize("settings.template.semantic.description", "Terms that can slice template automatically."),
    );
  }

  private getTemplateSemanticActiveTermsSearchText(): string {
    return normalizeSettingsSearchText(
      localize("settings.template.semantic.activeTitle", "Active match terms"),
      localize("settings.template.semantic.termInputPlaceholder", "Add match term"),
    );
  }

  private getTemplateDomainPacksSearchText(settings: TemplateSettings): string {
    return normalizeSettingsSearchText(
      localize("settings.template.domainPacks.title", "Domain Packs"),
      localize("settings.template.domainPacks.description", "Built-in domain packs scope title and marker evidence before Review builds binding candidates."),
      settings.builtinDomainPacks.map(formatDomainPackSearchText).join(" "),
    );
  }

  private getTemplateXAxisIntentPrioritySearchText(settings: TemplateSettings): string {
    return normalizeSettingsSearchText(
      localize("settings.template.xAxisPriority.title", "X Axis Intent Priority"),
      localize("settings.template.xAxisPriority.description", "Drag intent blocks to decide which X role wins when one table exposes several legal X sequences."),
      settings.xAxisIntentPriority.map(formatXAxisIntent).join(" "),
    );
  }

  private getTemplateSemanticRecommendedTermsSearchText(settings: TemplateSettings): string {
    return normalizeSettingsSearchText(
      localize("settings.template.semantic.recommendedBuiltinTitle", "Recommended built-in match terms"),
      settings.builtinTerms
        .filter(term => settings.disabledBuiltinTermIds.includes(term.id))
        .map(rule => `${rule.term} ${rule.canonicalRole} ${rule.axisTendency}`).join(" "),
    );
  }

  private getTemplateSemanticCustomFormSearchText(settings: TemplateSettings): string {
    return normalizeSettingsSearchText(
      localize("settings.template.semantic.customMappingTitle", "Custom term mapping"),
      optionLabels(settings.axisOptions),
      optionLabels(settings.unitOptions),
    );
  }

  private updateTemplateSemanticCustomForm(container: HTMLElement, settings: TemplateSettings): void {
    let widgets = this.templateSemanticCustomForms.get(container);
    if (!widgets) {
      reset(container);
      const titleText = localize("settings.template.semantic.customMappingTitle", "Custom term mapping");
      const form = div("settings-template-semantic-form");
      const grid = div("settings-grid settings-grid--two");
      const axisSelect = this.createSelectWidget(this.getTemplateSemanticAxisSelectOptions(settings));
      const unitSelect = this.createSelectWidget(this.getTemplateSemanticUnitSelectOptions(settings));
      grid.append(
        field(localize("settings.template.semantic.axisLabel", "Axis"), axisSelect.domNode),
        field(localize("settings.template.semantic.unitLabel", "Unit"), unitSelect.domNode),
      );
      form.appendChild(grid);
      container.append(
        text("p", "settings-template-subtitle", titleText),
        form,
      );
      widgets = {
        axisSelect,
        unitSelect,
      };
      this.templateSemanticCustomForms.set(container, widgets);
    }

    this.updateSelectWidget(widgets.axisSelect, this.getTemplateSemanticAxisSelectOptions(settings));
    this.updateSelectWidget(widgets.unitSelect, this.getTemplateSemanticUnitSelectOptions(settings));
  }

  private getTemplateSemanticAxisSelectOptions(settings: TemplateSettings): FieldOptions {
    return {
      id: "settings-template-semantic-axis-select",
      value: this.options.templateSemanticAxisDraft,
      onChange: this.options.setTemplateSemanticAxisDraft,
      options: settings.axisOptions,
      disabled: settings.isSaving,
    };
  }

  private getTemplateSemanticUnitSelectOptions(settings: TemplateSettings): FieldOptions {
    return {
      id: "settings-template-semantic-unit-select",
      value: this.options.templateSemanticUnitDraft,
      onChange: this.options.setTemplateSemanticUnitDraft,
      options: settings.unitOptions,
      disabled: settings.isSaving,
    };
  }

  private updateTemplateSemanticActiveTerms(container: HTMLElement, settings: TemplateSettings): void {
    const title = localize("settings.template.semantic.activeTitle", "Active match terms");
    this.getTemplateSemanticActiveTermsInputBox(container).update({
      ariaLabel: title,
      inputVisible: true,
      items: this.createTemplateSemanticActiveTermItems(settings),
      placeholder: localize("settings.template.semantic.termInputPlaceholder", "Add match term"),
      readOnly: false,
      value: this.options.templateSemanticTermDraft,
    });
  }

  private updateTemplateSemanticActiveTermItems(container: HTMLElement, settings: TemplateSettings): void {
    this.getTemplateSemanticActiveTermsInputBox(container).update({
      items: this.createTemplateSemanticActiveTermItems(settings),
    });
  }

  private updateTemplateSemanticActiveTermInput(container: HTMLElement, settings: TemplateSettings): void {
    this.getTemplateSemanticActiveTermsInputBox(container).update({
      ariaLabel: localize("settings.template.semantic.activeTitle", "Active match terms"),
      inputVisible: true,
      placeholder: localize("settings.template.semantic.termInputPlaceholder", "Add match term"),
      readOnly: false,
      value: this.options.templateSemanticTermDraft,
    });
  }

  private getTemplateSemanticActiveTermsInputBox(container: HTMLElement): InputBoxWidget {
    let inputBox = this.templateSemanticActiveTermFields.get(container);
    if (inputBox) {
      return inputBox;
    }

    reset(container);
    const section = div("settings-template-library-group");
    section.appendChild(text("p", "settings-template-subtitle", localize("settings.template.semantic.activeTitle", "Active match terms")));
    inputBox = this.registerContentDisposable(new InputBoxWidget());
    inputBox.element.classList.add("settings-template-term-inputbox");
    this.registerContentDisposable(inputBox.onDidChange(value => {
      this.options.setTemplateSemanticTermDraft(value);
    }));
    this.registerContentDisposable(inputBox.onDidAccept(() => {
      void this.options.templateSettings.onAddSemanticTerm();
    }));
    this.registerContentDisposable(inputBox.onDidTriggerItemAction(({ item }) => {
      if (item.kind === "builtin-enabled") {
        void this.options.templateSettings.onDisableBuiltinTerm(item.id);
        return;
      }
      if (item.kind === "custom") {
        void this.options.templateSettings.onRemoveSemanticTerm(item.id);
      }
    }));
    section.appendChild(inputBox.element);
    container.appendChild(section);
    this.templateSemanticActiveTermFields.set(container, inputBox);
    return inputBox;
  }

  private createTemplateSemanticActiveTermItems(settings: TemplateSettings): readonly IInputBoxWidgetItem[] {
    return settings.activeTerms.map(term => term.source === "builtin"
      ? this.createBuiltinSemanticTermItem(settings, term)
      : this.createCustomSemanticTermItem(settings, term));
  }

  private updateTemplateSemanticRecommendedTerms(container: HTMLElement, settings: TemplateSettings): void {
    const title = localize("settings.template.semantic.recommendedBuiltinTitle", "Recommended built-in match terms");
    let list = container.querySelector<HTMLElement>(".settings-template-term-suggestions");
    if (!list) {
      reset(container);
      const section = div("settings-template-library-group");
      section.appendChild(text("p", "settings-template-subtitle", title));
      list = div("settings-template-term-suggestions");
      section.appendChild(list);
      container.appendChild(section);
    }

    let buttons = this.templateSemanticRecommendedTermButtons.get(list);
    if (!buttons) {
      buttons = new Map();
      this.templateSemanticRecommendedTermButtons.set(list, buttons);
    }

    const disabledTermIds = new Set(settings.disabledBuiltinTermIds);
    const disabledTerms = settings.builtinTerms.filter(term => disabledTermIds.has(term.id));
    if (disabledTerms.length === 0) {
      for (const button of buttons.values()) {
        button.remove();
      }
      buttons.clear();
      let empty = this.templateSemanticRecommendedTermEmptyMessages.get(list);
      if (!empty) {
        empty = text(
          "p",
          "settings-template-empty",
          localize("settings.template.semantic.noDisabledBuiltin", "No recommended built-in match terms."),
        );
        this.templateSemanticRecommendedTermEmptyMessages.set(list, empty);
        list.appendChild(empty);
      }
      return;
    }

    this.templateSemanticRecommendedTermEmptyMessages.get(list)?.remove();
    this.templateSemanticRecommendedTermEmptyMessages.delete(list);
    const nextIds = new Set<string>();
    for (const term of disabledTerms) {
      nextIds.add(term.id);
      let button = buttons.get(term.id);
      if (!button) {
        button = this.createBuiltinSemanticTermSuggestion(settings, term);
        buttons.set(term.id, button);
      }
      this.updateBuiltinSemanticTermSuggestion(button, settings, term);
    }
    for (const [id, button] of Array.from(buttons)) {
      if (nextIds.has(id)) {
        continue;
      }
      button.remove();
      buttons.delete(id);
    }

    let referenceNode: ChildNode | null = null;
    for (let index = disabledTerms.length - 1; index >= 0; index--) {
      const term = disabledTerms[index]!;
      const button = buttons.get(term.id)!;
      if (button.parentElement !== list || button.nextSibling !== referenceNode) {
        list.insertBefore(button, referenceNode);
      }
      referenceNode = button;
    }
  }

  private createBuiltinSemanticTermSuggestion(
    settings: TemplateSettings,
    semanticTerm: TemplateBuiltinSemanticTerm,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-template-term-suggestion";
    button.disabled = settings.pendingActionItemId === semanticTerm.id;
    button.title = localize("settings.template.semantic.enableBuiltinTitle", "Enable this built-in match term for Review");
    button.setAttribute(
      "aria-label",
      localize("settings.template.semantic.enableBuiltin", "Enable built-in match term {term}", { term: semanticTerm.term }),
    );
    button.append(
      createLxIcon({ className: "settings-template-term-suggestion-icon", icon: LxIcon.add, size: 14 }),
      text("span", "settings-template-term-suggestion-label", semanticTerm.term),
    );
    button.addEventListener("click", () => {
      void this.options.templateSettings.onEnableBuiltinTerm(semanticTerm.id);
    });
    return button;
  }

  private updateBuiltinSemanticTermSuggestion(
    button: HTMLButtonElement,
    settings: TemplateSettings,
    semanticTerm: TemplateBuiltinSemanticTerm,
  ): void {
    button.disabled = settings.pendingActionItemId === semanticTerm.id;
    button.title = localize("settings.template.semantic.enableBuiltinTitle", "Enable this built-in match term for Review");
    button.setAttribute(
      "aria-label",
      localize("settings.template.semantic.enableBuiltin", "Enable built-in match term {term}", { term: semanticTerm.term }),
    );
    const label = button.querySelector<HTMLElement>(".settings-template-term-suggestion-label");
    if (label && label.textContent !== semanticTerm.term) {
      label.textContent = semanticTerm.term;
    }
  }

  private createBuiltinSemanticTermItem(
    settings: TemplateSettings,
    semanticTerm: TemplateBuiltinSemanticTerm,
  ): IInputBoxWidgetItem {
    return {
      id: semanticTerm.id,
      label: semanticTerm.term,
      kind: "builtin-enabled",
      action: {
        ariaLabel: localize("settings.template.semantic.disableBuiltin", "Disable built-in match term {term}", { term: semanticTerm.term }),
        icon: LxIcon.close,
      },
      disabled: settings.pendingActionItemId === semanticTerm.id,
    };
  }

  private createCustomSemanticTermItem(settings: TemplateSettings, semanticTerm: TemplateSemanticTerm): IInputBoxWidgetItem {
    return {
      id: semanticTerm.id,
      label: semanticTerm.term,
      kind: "custom",
      action: {
        ariaLabel: localize("settings.template.semantic.removeTerm", "Remove match term {term}", { term: semanticTerm.term }),
        icon: LxIcon.close,
      },
      disabled: settings.pendingActionItemId === semanticTerm.id,
    };
  }

  private createAppearanceSettingsTree(): readonly SettingsTreeSection[] {
    const { appearanceSettings } = this.options;
    return [
      {
        id: "settings-appearance-section",
        title: this.getSectionLabel("appearance"),
        items: [
          this.createSettingsTreeRowItem({
            id: "settings-theme-item",
            title: localize("settings.theme.title", "Theme"),
            description: localize("settings.theme.description", "Choose the workbench color theme."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.themeModeOptions)),
            content: this.createLocalSelectControl("settings-theme-item", () => ({
              id: "settings-theme-dropdown",
              value: this.options.theme,
              onChange: value => {
                if (value === "system" || value === "light" || value === "dark") {
                  void this.options.onThemeChange(value);
                }
              },
              options: this.options.themeModeOptions,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-explorer-density-item",
            title: localize("settings.explorerDensity.title", "Explorer Density"),
            description: localize("settings.explorerDensity.description", "Choose how compact file rows appear in Explorer."),
            searchText: normalizeSettingsSearchText(optionLabels(appearanceSettings.explorerDensityOptions)),
            content: this.createLocalSelectControl("settings-explorer-density-item", () => ({
              id: "settings-explorer-density-dropdown",
              value: this.options.appearanceSettings.explorerDensity,
              onChange: value => {
                if (value === "compact" || value === "default" || value === "comfortable") {
                  void this.options.appearanceSettings.onExplorerDensityChange(value);
                }
              },
              options: this.options.appearanceSettings.explorerDensityOptions,
              disabled: this.options.appearanceSettings.isExplorerDensitySaving,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-explorer-badges-item",
            title: localize("settings.explorerBadges.title", "Explorer Badges"),
            description: localize("settings.explorerBadges.description", "Show measurement badges beside files in Explorer."),
            content: this.createLocalSwitchControl({
              itemId: "settings-explorer-badges-item",
              ariaLabel: localize("settings.explorerBadges.title", "Explorer Badges"),
              getChecked: () => this.options.appearanceSettings.showExplorerBadges,
              id: "settings-explorer-badges-toggle",
              onChange: checked => {
                void this.options.appearanceSettings.onExplorerBadgeVisibilityChange(checked);
              },
            }),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-explorer-badge-colors-item",
            title: localize("settings.explorerBadgeColors.title", "Badge Colors"),
            description: localize("settings.explorerBadgeColors.description", "Choose Explorer badge colors by measurement label."),
            searchText: normalizeSettingsSearchText(
              optionLabels(appearanceSettings.explorerBadgeColorLabels),
              optionLabels(appearanceSettings.explorerBadgeColorOptions),
            ),
            content: this.createBadgeColorControls(appearanceSettings),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-layout-item",
            title: localize("settings.layout.title", "Layout"),
            description: localize("settings.layout.description", "Reset sidebar width and hidden workbench parts."),
            content: this.createLayoutResetControl(),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-background-item",
            title: localize("settings.background.title", "Background"),
            description: localize("settings.background.description", "Choose the workbench page background color."),
            content: this.createBackgroundControls(appearanceSettings),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-transparent-chrome-item",
            title: localize("settings.transparentChrome.title", "Translucent sidebar"),
            description: localize("settings.transparentChrome.description", "Let the sidebar blend with the desktop window surface."),
            content: this.createLocalSwitchControl({
              itemId: "settings-transparent-chrome-item",
              ariaLabel: localize("settings.transparentChrome.title", "Translucent sidebar"),
              getChecked: () => this.options.appearanceSettings.transparentChrome,
              id: "settings-transparent-chrome-toggle",
              onChange: checked => {
                void this.options.appearanceSettings.onTransparentChromeChange(checked);
              },
            }),
          }),
        ],
      },
    ];
  }

  private createBadgeColorControls(appearanceSettings: AppearanceSettings): HTMLElement {
    if (!appearanceSettings.explorerBadgeColorLabels.some(label => label.value === this.activeBadgeLabelValue)) {
      this.activeBadgeLabelValue = appearanceSettings.explorerBadgeColorLabels[0]?.value ?? "transfer";
    }

    const badgeColorSwatches = div("settings-badge-colors");
    const badgeColorButtons = new Map<string, HTMLButtonElement>();
    const badgeLabelSelect = this.createSelectWidget({
      id: "settings-explorer-badge-label-dropdown",
      value: this.activeBadgeLabelValue,
      onChange: value => {
        this.activeBadgeLabelValue = value;
        this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, this.options.appearanceSettings);
      },
      options: appearanceSettings.explorerBadgeColorLabels,
      disabled: appearanceSettings.isExplorerBadgeColorSaving,
    });
    const badgePreview = document.createElement("span");
    badgePreview.className = "settings-badge-preview";

    badgeColorSwatches.append(
      div("settings-badge-color-options"),
      badgePreview,
      badgeLabelSelect.domNode,
    );
    this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, appearanceSettings);
    this.registerLocalContentPatch("settings-explorer-badge-colors-item", {
      element: badgeColorSwatches,
      getSearchText: () => normalizeSettingsSearchText(
        optionLabels(this.options.appearanceSettings.explorerBadgeColorLabels),
        optionLabels(this.options.appearanceSettings.explorerBadgeColorOptions),
      ),
      update: () => {
        const settings = this.options.appearanceSettings;
        if (!settings.explorerBadgeColorLabels.some(label => label.value === this.activeBadgeLabelValue)) {
          this.activeBadgeLabelValue = settings.explorerBadgeColorLabels[0]?.value ?? "transfer";
        }
        this.updateSelectWidget(badgeLabelSelect, {
          id: "settings-explorer-badge-label-dropdown",
          value: this.activeBadgeLabelValue,
          onChange: value => {
            this.activeBadgeLabelValue = value;
            this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, this.options.appearanceSettings);
          },
          options: settings.explorerBadgeColorLabels,
          disabled: settings.isExplorerBadgeColorSaving,
        });
        this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, settings);
      },
    });
    return badgeColorSwatches;
  }

  private createLayoutResetControl(): HTMLElement {
    const layoutResetAction = this.registerContentDisposable(new Action(
      "settings.layout.reset",
      localize("settings.layout.resetButton", "Reset Layout"),
      "",
      true,
      () => void this.options.onResetLayoutState(),
    ));
    layoutResetAction.tooltip = localize("settings.layout.resetButton", "Reset Layout");
    layoutResetAction.icon = LxIcon.refresh;
    const layoutResetActionContainer = div("settings-reset-action");
    const layoutResetActionItem = this.registerContentDisposable(new SettingsResetActionViewItem(layoutResetAction));
    layoutResetActionItem.render(layoutResetActionContainer);
    return layoutResetActionContainer;
  }

  private createBackgroundControls(appearanceSettings: AppearanceSettings): HTMLElement {
    const colorInput = document.createElement("input");
    colorInput.id = "settings-background-color-input";
    colorInput.className = "settings-color-input";
    colorInput.type = "color";
    colorInput.value = appearanceSettings.backgroundColor;
    colorInput.disabled = appearanceSettings.isSaving;
    colorInput.addEventListener("change", () => {
      void this.options.appearanceSettings.onBackgroundColorChange(colorInput.value);
    });

    const swatches = div("settings-color-swatches");
    const swatchButtons = new Map<string, HTMLButtonElement>();
    this.renderBackgroundSwatches(swatches, swatchButtons, appearanceSettings);

    const backgroundResetAction = this.registerContentDisposable(new Action(
      "settings.background.reset",
      localize("settings.background.reset", "Reset"),
      "",
      !appearanceSettings.isSaving && appearanceSettings.backgroundColor !== appearanceSettings.backgroundColorDefault,
      () => void this.options.appearanceSettings.onBackgroundColorReset(),
    ));
    backgroundResetAction.tooltip = localize("settings.background.reset", "Reset");
    backgroundResetAction.icon = LxIcon.refresh;
    const backgroundResetActionContainer = div("settings-reset-action");
    const backgroundResetActionItem = this.registerContentDisposable(new SettingsResetActionViewItem(backgroundResetAction));
    backgroundResetActionItem.render(backgroundResetActionContainer);

    const controls = div(
      "settings-color-controls",
      colorInput,
      backgroundResetActionContainer,
      swatches,
    );
    this.registerLocalContentPatch("settings-background-item", {
      element: controls,
      getSearchText: () => normalizeSettingsSearchText(this.options.appearanceSettings.backgroundColorOptions),
      update: () => {
        const settings = this.options.appearanceSettings;
        colorInput.value = settings.backgroundColor;
        colorInput.disabled = settings.isSaving;
        backgroundResetAction.enabled = !settings.isSaving && settings.backgroundColor !== settings.backgroundColorDefault;
        this.renderBackgroundSwatches(swatches, swatchButtons, settings);
      },
    });
    return controls;
  }

  private createOriginSettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-origin-section",
        title: this.getSectionLabel("origin"),
        items: [
          this.createSettingsTreeElementItem({
            id: "settings-origin-path-item",
            createElement: () => this.createOriginPathItem(this.options.originSettings),
            searchText: this.getOriginPathSearchText(this.options.originSettings),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-origin-cleanup-item",
            createElement: () => this.createOriginCleanupItem(this.options.originSettings),
            searchText: this.getOriginCleanupSearchText(),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-origin-plot-item",
            createElement: () => this.createOriginPlot(this.options.originSettings),
            searchText: this.getOriginPlotSearchText(),
          }),
        ],
      },
    ];
  }

  private getOriginPathSearchText(originSettings: OriginSettingsSectionProps): string {
    return normalizeSettingsSearchText(
      localize("settings.origin.title", "Origin Executable Path"),
      localize("settings.origin.description", "Choose the Origin app used to open files."),
      originSettings.currentPath,
      localize("settings.origin.choosePathButton", "Choose Origin.exe"),
      localize("settings.origin.checkButton", "Check Connection"),
      localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."),
    );
  }

  private getOriginCleanupSearchText(): string {
    return normalizeSettingsSearchText(
      localize("settings.origin.cleanup.title", "Runtime Cleanup"),
      localize("settings.origin.cleanup.description", "Manage automatic cleanup for Origin runtime cache."),
      localize("settings.origin.cleanup.enableLabel", "Auto cleanup"),
      optionLabels(this.options.cleanupEnabledOptions),
      localize("settings.origin.cleanup.keepSuccessLabel", "Keep successful jobs"),
      optionLabels(this.options.cleanupKeepSuccessOptions),
      localize("settings.origin.cleanup.failedDaysLabel", "Keep failed jobs (days)"),
      optionLabels(this.options.cleanupFailedDaysOptions),
      localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
    );
  }

  private createOriginPathItem(originSettings: OriginSettingsSectionProps): HTMLElement {
    const originPathTitle = localize("settings.origin.title", "Origin Executable Path");
    const originPathDescription = localize("settings.origin.description", "Choose the Origin app used to open files.");
    const pathCell = cell("settings-origin-path-item", "settings-cell-block");
    pathCell.append(
      headingBlock(originPathTitle, originPathDescription),
      this.createPathControls(originSettings),
    );
    return pathCell;
  }

  private createOriginCleanupItem(originSettings: OriginSettingsSectionProps): HTMLElement {
    const cleanupTitle = localize("settings.origin.cleanup.title", "Runtime Cleanup");
    const cleanupDescription = localize("settings.origin.cleanup.description", "Manage automatic cleanup for Origin runtime cache.");
    const cleanupCell = cell("settings-origin-cleanup-item", "settings-cell-block");
    const enabledSelect = this.createSelectWidget({
      id: "settings-origin-cleanup-enabled-select",
      value: String(Boolean(originSettings.cleanupEnabled)),
      onChange: value => void this.options.originSettings.onCleanupEnabledChange(value === "true"),
      options: this.options.cleanupEnabledOptions,
      disabled: originSettings.cleanupSaving,
    });
    const keepSuccessSelect = this.createSelectWidget({
      id: "settings-origin-cleanup-keep-success-select",
      value: String(originSettings.cleanupKeepSuccessJobs ?? 0),
      onChange: value => void this.options.originSettings.onCleanupKeepSuccessJobsChange(value),
      options: this.options.cleanupKeepSuccessOptions,
      disabled: originSettings.cleanupSaving,
    });
    const failedDaysSelect = this.createSelectWidget({
      id: "settings-origin-cleanup-failed-days-select",
      value: String(originSettings.cleanupFailedRetentionDays ?? 7),
      onChange: value => void this.options.originSettings.onCleanupFailedRetentionDaysChange(value),
      options: this.options.cleanupFailedDaysOptions,
      disabled: originSettings.cleanupSaving,
    });
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings.origin.cleanup.enableLabel", "Auto cleanup"), enabledSelect.domNode),
      field(localize("settings.origin.cleanup.keepSuccessLabel", "Keep successful jobs"), keepSuccessSelect.domNode),
      field(localize("settings.origin.cleanup.failedDaysLabel", "Keep failed jobs (days)"), failedDaysSelect.domNode),
    );
    const runButton = this.createButton({
      id: "settings-origin-cleanup-run-btn",
      label: originSettings.cleanupRunning ? localize("settings.origin.cleanup.running", "Cleaning...") : localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
      onClick: () => void this.options.originSettings.onRunCleanupNow(),
      disabled: !originSettings.isCleanupAvailable || originSettings.cleanupRunning || originSettings.cleanupSaving,
      variant: "secondary",
    });
    cleanupCell.append(
      headingBlock(cleanupTitle, cleanupDescription),
      grid,
      div("settings-actions-end", runButton),
    );
    this.registerLocalContentPatch("settings-origin-cleanup-item", {
      element: cleanupCell,
      getSearchText: () => this.getOriginCleanupSearchText(),
      update: () => {
        const settings = this.options.originSettings;
        this.updateSelectWidget(enabledSelect, {
          id: "settings-origin-cleanup-enabled-select",
          value: String(Boolean(settings.cleanupEnabled)),
          onChange: value => void this.options.originSettings.onCleanupEnabledChange(value === "true"),
          options: this.options.cleanupEnabledOptions,
          disabled: settings.cleanupSaving,
        });
        this.updateSelectWidget(keepSuccessSelect, {
          id: "settings-origin-cleanup-keep-success-select",
          value: String(settings.cleanupKeepSuccessJobs ?? 0),
          onChange: value => void this.options.originSettings.onCleanupKeepSuccessJobsChange(value),
          options: this.options.cleanupKeepSuccessOptions,
          disabled: settings.cleanupSaving,
        });
        this.updateSelectWidget(failedDaysSelect, {
          id: "settings-origin-cleanup-failed-days-select",
          value: String(settings.cleanupFailedRetentionDays ?? 7),
          onChange: value => void this.options.originSettings.onCleanupFailedRetentionDaysChange(value),
          options: this.options.cleanupFailedDaysOptions,
          disabled: settings.cleanupSaving,
        });
        this.updateButton(runButton, {
          id: "settings-origin-cleanup-run-btn",
          label: settings.cleanupRunning ? localize("settings.origin.cleanup.running", "Cleaning...") : localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
          disabled: !settings.isCleanupAvailable || settings.cleanupRunning || settings.cleanupSaving,
          variant: "secondary",
        });
      },
    });
    return cleanupCell;
  }

  private createAboutSettingsTree(): readonly SettingsTreeSection[] {
    const { appUpdateSettings } = this.options;
    return [
      {
        id: "settings-about-section",
        title: this.getSectionLabel("about"),
        items: [
          this.createSettingsTreeRowItem({
            id: "settings-about-version-item",
            title: localize("settings.about.versionTitle", "Current Version"),
            description: localize("settings.about.versionDescription", "The installed Conductor Studio version."),
            content: text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings.about.versionUnknown", "Unknown")),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-release-notes-item",
            title: localize("settings.releaseNotes.title", "Release Notes"),
            description: localize("settings.releaseNotes.description", "Review recent product changes and fixes."),
            searchText: localize("settings.releaseNotes.showButton", "Show Release Notes"),
            content: this.createButton({
              id: "settings-release-notes-show-btn",
              label: localize("settings.releaseNotes.showButton", "Show Release Notes"),
              onClick: this.options.handleShowReleaseNotes,
              variant: "secondary",
            }),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-user-guide-item",
            title: localize("settings.userGuide.title", "User Guide"),
            description: localize("settings.userGuide.description", "Open the bundled guide for common workflows."),
            searchText: localize("settings.userGuide.showButton", "Show User Guide"),
            content: this.createButton({
              id: "settings-user-guide-show-btn",
              label: localize("settings.userGuide.showButton", "Show User Guide"),
              onClick: () => this.showUserGuideDialog(),
              variant: "secondary",
            }),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-app-update-item",
            title: localize("settings.appUpdate.title", "App Updates"),
            description: localize("settings.appUpdate.description", "Check whether a newer version is available."),
            searchText: localize("settings.appUpdate.checkButton", "Check for Updates"),
            content: this.createLocalButtonControl("settings-app-update-item", () => ({
              id: "settings-app-update-check-btn",
              label: this.options.appUpdateChecking ? localize("settings.appUpdate.checking", "Checking...") : localize("settings.appUpdate.checkButton", "Check for Updates"),
              onClick: this.options.handleCheckForUpdates,
              disabled: !this.options.appUpdateSettings.isAvailable || this.options.appUpdateChecking,
              variant: "secondary",
            })),
          }),
        ],
      },
    ];
  }

  private showUserGuideDialog(): void {
    this.showSettingsDocumentDialog({
      idBase: "settings-user-guide",
      markdown: readBundledUserGuideMarkdown(),
      title: localize("settings.userGuide.dialogTitle", "User Guide"),
    });
  }

  private showSettingsDocumentDialog(options: SettingsDocumentDialogOptions): void {
    this.closeSettingsDocumentDialog();

    const disposeStore = new DisposableStore();
    const overlay = document.createElement("div");
    overlay.className = MODAL_OVERLAY_CLASS;

    const backdrop = document.createElement("div");
    backdrop.className = MODAL_BACKDROP_CLASS;
    overlay.appendChild(backdrop);

    const dialogId = getModalDialogId(options.idBase) ?? `${options.idBase}-dialog`;
    const titleId = getModalTitleId(options.idBase, options.idBase);
    const panel = document.createElement("section");
    panel.className = getModalDialogClassName({
      className: "settings-document-modal",
      size: "xl",
      variant: "solid",
    });
    panel.id = dialogId;
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", titleId);

    const header = document.createElement("header");
    header.className = "modal_header settings-document-modal__header";
    const titleWrap = div("settings-document-modal__titleWrap");
    titleWrap.append(createLxIcon({ className: "settings-document-modal__titleIcon", icon: LxIcon.fileText, size: 18 }));
    const heading = document.createElement("h2");
    heading.className = "modal_title settings-document-modal__title";
    heading.id = titleId;
    heading.textContent = options.title;
    titleWrap.appendChild(heading);

    const closeActionBar = disposeStore.add(createModalCloseActionBar({
      className: "settings-document-modal__close",
      id: "settings.document.close",
      label: localize("settings.document.close", "Close"),
      run: () => this.closeSettingsDocumentDialog(),
    }));
    header.append(titleWrap, closeActionBar.domNode);

    const body = document.createElement("div");
    body.className = `modal_body ${MODAL_BODY_SCROLL_CLASS} settings-document-modal__body`;
    body.appendChild(renderWorkbenchMarkdown(options.markdown, {
      className: "settings-markdown",
    }));

    panel.append(header, body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    this.settingsDocumentDialog = { disposeStore, overlay };
    disposeStore.add(addDisposableListener(backdrop, EventType.MOUSE_DOWN, event => {
      if (event.target === backdrop) {
        this.closeSettingsDocumentDialog();
      }
    }));
    disposeStore.add(addDisposableListener(document, EventType.KEY_DOWN, event => {
      if (event.key === "Escape") {
        this.closeSettingsDocumentDialog();
      }
    }));
    queueMicrotask(() => panel.focus());
  }

  private closeSettingsDocumentDialog(): void {
    const dialog = this.settingsDocumentDialog;
    if (!dialog) {
      return;
    }
    this.settingsDocumentDialog = null;
    dialog.disposeStore.dispose();
    dialog.overlay.remove();
  }

  private createChartSettingsTree(settings: ChartDefaultSettings): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-chart-section",
        title: localize("settings.chartDefaults.sectionTitle", "Chart"),
        items: [
          this.createSettingsTreeRowItem({
            id: "settings-default-transfer-y-scale-item",
            title: localize("settings.chartScaleDefaults.transferCurve", "Transfer"),
            description: localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.yScaleOptions)),
            content: this.createLocalSelectControl("settings-default-transfer-y-scale-item", () => ({
              id: "settings-default-transfer-y-scale-select",
              value: this.options.chartDefaultSettings.defaultYScaleForTransfer,
              onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForTransferChange(value),
              options: this.options.yScaleOptions,
              disabled: this.options.chartDefaultSettings.isSaving,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-default-output-y-scale-item",
            title: localize("settings.chartScaleDefaults.outputCurve", "Output"),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            content: this.createLocalSelectControl("settings-default-output-y-scale-item", () => ({
              id: "settings-default-output-y-scale-select",
              value: this.options.chartDefaultSettings.defaultYScaleForOutput,
              onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForOutputChange(value),
              options: this.options.yScaleOptions,
              disabled: this.options.chartDefaultSettings.isSaving,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-default-cv-y-scale-item",
            title: localize("settings.chartScaleDefaults.cvCurve", "C-V"),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            content: this.createLocalSelectControl("settings-default-cv-y-scale-item", () => ({
              id: "settings-default-cv-y-scale-select",
              value: this.options.chartDefaultSettings.defaultYScaleForCv,
              onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForCvChange(value),
              options: this.options.yScaleOptions,
              disabled: this.options.chartDefaultSettings.isSaving,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-default-cf-y-scale-item",
            title: localize("settings.chartScaleDefaults.cfCurve", "C-f"),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            content: this.createLocalSelectControl("settings-default-cf-y-scale-item", () => ({
              id: "settings-default-cf-y-scale-select",
              value: this.options.chartDefaultSettings.defaultYScaleForCf,
              onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForCfChange(value),
              options: this.options.yScaleOptions,
              disabled: this.options.chartDefaultSettings.isSaving,
            })),
          }),
          this.createSettingsTreeRowItem({
            id: "settings-default-pv-y-scale-item",
            title: localize("settings.chartScaleDefaults.pvCurve", "P-V"),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            content: this.createLocalSelectControl("settings-default-pv-y-scale-item", () => ({
              id: "settings-default-pv-y-scale-select",
              value: this.options.chartDefaultSettings.defaultYScaleForPv,
              onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForPvChange(value),
              options: this.options.yScaleOptions,
              disabled: this.options.chartDefaultSettings.isSaving,
            })),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-chart-defaults-item",
            createElement: () => this.createChartDefaults(settings),
            searchText: this.getChartDefaultsSearchText(),
          }),
        ],
      },
    ];
  }

  private createChartDefaults(settings: ChartDefaultSettings): HTMLElement {
    const container = cell("settings-chart-defaults-item", "settings-cell-block");
    const titleText = localize("settings.chartTypographyDefaults.title", "Chart Typography Defaults");
    const description = localize("settings.chartTypographyDefaults.description", "Choose default chart title and tick label sizes.");
    container.appendChild(headingBlock(
      titleText,
      description,
    ));
    const grid = div("settings-grid settings-grid--three");
    const titleInput = this.createInputWidget({
      id: "settings-default-title-font-size-input",
      value: this.options.axisTitleFontSizeDraft,
      onChange: this.options.setAxisTitleFontSizeDraft,
      onBlur: () => {
        const settings = this.options.chartDefaultSettings;
        if (this.options.axisTitleFontSizeDraft !== String(settings.axisTitleFontSize ?? "")) {
          void settings.onAxisTitleFontSizeChange(this.options.axisTitleFontSizeDraft.trim());
        }
      },
      placeholder: "22",
      disabled: settings.isSaving,
    });
    const tickInput = this.createInputWidget({
      id: "settings-default-tick-label-font-size-input",
      value: this.options.tickLabelFontSizeDraft,
      onChange: this.options.setTickLabelFontSizeDraft,
      onBlur: () => {
        const settings = this.options.chartDefaultSettings;
        if (this.options.tickLabelFontSizeDraft !== String(settings.tickLabelFontSize ?? "")) {
          void settings.onTickLabelFontSizeChange(this.options.tickLabelFontSizeDraft.trim());
        }
      },
      placeholder: "18",
      disabled: settings.isSaving,
    });
    grid.append(
      field(localize("settings.chartTypographyDefaults.titleSize", "Title"), titleInput.element),
      field(localize("settings.chartTypographyDefaults.tickLabel", "Tick label"), tickInput.element),
    );
    container.appendChild(grid);
    this.registerLocalContentPatch("settings-chart-defaults-item", {
      element: container,
      getSearchText: () => this.getChartDefaultsSearchText(),
      update: () => {
        const settings = this.options.chartDefaultSettings;
        this.updateInputWidget(titleInput, {
          id: "settings-default-title-font-size-input",
          value: this.options.axisTitleFontSizeDraft,
          onChange: this.options.setAxisTitleFontSizeDraft,
          placeholder: "22",
          disabled: settings.isSaving,
        });
        this.updateInputWidget(tickInput, {
          id: "settings-default-tick-label-font-size-input",
          value: this.options.tickLabelFontSizeDraft,
          onChange: this.options.setTickLabelFontSizeDraft,
          placeholder: "18",
          disabled: settings.isSaving,
        });
      },
    });
    return container;
  }

  private getChartDefaultsSearchText(): string {
    return normalizeSettingsSearchText(
      localize("settings.chartTypographyDefaults.title", "Chart Typography Defaults"),
      localize("settings.chartTypographyDefaults.description", "Choose default chart title and tick label sizes."),
      localize("settings.chartTypographyDefaults.titleSize", "Title"),
      localize("settings.chartTypographyDefaults.tickLabel", "Tick label"),
    );
  }

  private createFileNameMatching(settings: FileNameMatchingSettings): HTMLElement {
    const container = cell("settings-filename-matching-item", "settings-cell-block");
    const titleText = localize("settings.filenameMatching.title", "Filename Field Matching");
    const description = localize("settings.filenameMatching.description", "Choose which separator characters split filename fields for template rules.");
    const separatorsLabel = localize("settings.filenameMatching.label", "Field separators");
    const hint = localize("settings.filenameMatching.hint", "Each character acts as a separator. The default is {value}.", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS });
    container.appendChild(headingBlock(titleText, description));
    const body = div("settings-field");
    const separatorsInput = this.createInputWidget({
      id: "settings-filename-separators-input",
      value: this.options.fileNameFieldSeparatorsDraft,
      onChange: this.options.setFileNameFieldSeparatorsDraft,
      onBlur: () => {
        const settings = this.options.fileNameMatchingSettings;
        if (this.options.fileNameFieldSeparatorsDraft !== settings.fieldSeparators) {
          void settings.onFieldSeparatorsChange(this.options.fileNameFieldSeparatorsDraft);
        }
      },
      disabled: settings.isSaving,
    });
    body.append(
      label(separatorsLabel),
      div("settings-input settings-input--mono", separatorsInput.element),
      text("p", "settings-hint", hint),
    );
    container.appendChild(body);
    this.registerLocalContentPatch("settings-filename-matching-item", {
      element: container,
      getSearchText: () => this.getFileNameMatchingSearchText(),
      update: () => {
        const settings = this.options.fileNameMatchingSettings;
        this.updateInputWidget(separatorsInput, {
          id: "settings-filename-separators-input",
          value: this.options.fileNameFieldSeparatorsDraft,
          onChange: this.options.setFileNameFieldSeparatorsDraft,
          disabled: settings.isSaving,
        });
      },
    });
    return container;
  }

  private getFileNameMatchingSearchText(): string {
    return normalizeSettingsSearchText(
      localize("settings.filenameMatching.title", "Filename Field Matching"),
      localize("settings.filenameMatching.description", "Choose which separator characters split filename fields for template rules."),
      localize("settings.filenameMatching.label", "Field separators"),
      localize("settings.filenameMatching.hint", "Each character acts as a separator. The default is {value}.", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS }),
    );
  }

  private createPathControls(settings: OriginSettingsSectionProps): HTMLElement {
    const controls = div("settings-path-controls");
    const pathValue = settings.currentPath || (settings.isLoading
      ? localize("settings.origin.loading", "Loading...")
      : localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."));
    const pathInputBox = this.registerContentDisposable(createInputBox({
      ariaLabel: localize("settings.origin.title", "Origin Executable Path"),
      id: "settings-origin-path-value-input",
      readOnly: true,
      value: pathValue,
    }));
    const chooseButton = this.createButton({
      id: "settings-origin-path-choose-btn",
      label: localize("settings.origin.choosePathButton", "Choose Origin.exe"),
      onClick: () => void this.options.originSettings.onChoosePath(),
      disabled: !settings.isConfigurable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
      variant: "primary",
    });
    const healthButton = this.createButton({
      id: "settings-origin-health-check-btn",
      label: settings.isHealthChecking ? localize("settings.origin.checking", "Checking...") : localize("settings.origin.checkButton", "Check Connection"),
      onClick: () => void this.options.originSettings.onCheckHealth(),
      disabled: !settings.isHealthCheckAvailable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
      variant: "secondary",
    });
    controls.append(
      div("settings-path-input", pathInputBox.element),
      chooseButton,
      healthButton,
    );
    this.registerLocalContentPatch("settings-origin-path-item", {
      element: controls,
      getSearchText: () => this.getOriginPathSearchText(this.options.originSettings),
      update: () => {
        const settings = this.options.originSettings;
        const pathValue = settings.currentPath || (settings.isLoading
          ? localize("settings.origin.loading", "Loading...")
          : localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."));
        pathInputBox.update({
          ariaLabel: localize("settings.origin.title", "Origin Executable Path"),
          id: "settings-origin-path-value-input",
          readOnly: true,
          value: pathValue,
        });
        this.updateButton(chooseButton, {
          id: "settings-origin-path-choose-btn",
          label: localize("settings.origin.choosePathButton", "Choose Origin.exe"),
          disabled: !settings.isConfigurable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
          variant: "primary",
        });
        this.updateButton(healthButton, {
          id: "settings-origin-health-check-btn",
          label: settings.isHealthChecking ? localize("settings.origin.checking", "Checking...") : localize("settings.origin.checkButton", "Check Connection"),
          disabled: !settings.isHealthCheckAvailable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
          variant: "secondary",
        });
      },
    });
    return controls;
  }

  private createOriginPlot(settings: OriginSettingsSectionProps): HTMLElement {
    const container = cell("settings-origin-plot-item", "settings-cell-block");
    const titleText = localize("settings.origin.plot.title", "Default Plot Settings");
    const description = localize("settings.origin.plot.description", "Used by \"Open in Origin\".");
    container.appendChild(headingBlock(titleText, description));
    const xyPairsInput = this.createInputWidget({
      id: "settings-origin-plot-xy-pairs-input",
      value: this.options.xyPairsDraft,
      onChange: this.options.setXyPairsDraft,
      onBlur: () => {
        const settings = this.options.originSettings;
        const nextValue = this.options.xyPairsDraft.trim();
        if (nextValue !== (settings.plotXyPairs ?? "")) {
          void settings.onPlotXyPairsChange(nextValue);
        }
      },
      disabled: settings.plotSaving || !settings.isConfigurable,
    });
    const commandInput = this.createInputWidget({
      id: "settings-origin-plot-command-input",
      value: this.options.plotCommandDraft,
      onChange: this.options.setPlotCommandDraft,
      onBlur: () => {
        const settings = this.options.originSettings;
        const nextValue = this.options.plotCommandDraft.trim();
        if (nextValue !== (settings.plotCommand ?? "")) {
          void settings.onPlotCommandChange(nextValue);
        }
      },
      disabled: settings.plotSaving || !settings.isConfigurable,
    });
    const legendInput = this.createInputWidget({
      id: "settings-origin-legend-font-size-input",
      value: this.options.originLegendFontSizeDraft,
      onChange: this.options.setOriginLegendFontSizeDraft,
      onBlur: () => {
        const settings = this.options.originSettings;
        if (this.options.originLegendFontSizeDraft !== String(settings.plotLegendFontSize ?? "")) {
          void settings.onPlotLegendFontSizeChange(this.options.originLegendFontSizeDraft.trim());
        }
      },
      placeholder: localize("chart.axis.auto", "auto"),
      disabled: settings.plotSaving || !settings.isConfigurable,
    });
    const postCommandsContainer = div("settings-field");
    const postCommandsTextarea = document.createElement("textarea");
    postCommandsTextarea.id = "settings-origin-plot-post-commands-input";
    postCommandsTextarea.className = "settings-textarea";
    postCommandsTextarea.value = this.options.postCommandsDraft;
    postCommandsTextarea.disabled = settings.plotSaving || !settings.isConfigurable;
    postCommandsTextarea.addEventListener("input", () => this.options.setPostCommandsDraft(postCommandsTextarea.value));
    postCommandsTextarea.addEventListener("blur", () => {
      const settings = this.options.originSettings;
      const nextValue = this.options.postCommandsDraft.trim();
      const currentValue = String(settings.plotPostCommandsText ?? "").trim();
      if (nextValue !== currentValue) {
        void settings.onPlotPostCommandsChange(nextValue);
      }
    });
    postCommandsContainer.append(
      label(localize("settings.origin.plot.postCommandsLabel", "Post-plot commands")),
      postCommandsTextarea,
      text("p", "settings-hint", localize("settings.origin.plot.postCommandsHint", "One LabTalk command per line, executed after plotting.")),
    );
    container.append(
      field(localize("settings.origin.plot.xyPairsLabel", "XY pairs"), xyPairsInput.element, localize("settings.origin.plot.xyPairsHint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4)).")),
      field(localize("settings.origin.plot.commandLabel", "Plot command override"), commandInput.element, localize("settings.origin.plot.commandHint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs.")),
      field(localize("chart.legend.fontSize", "Legend size"), legendInput.element),
      postCommandsContainer,
    );
    this.registerLocalContentPatch("settings-origin-plot-item", {
      element: container,
      getSearchText: () => this.getOriginPlotSearchText(),
      update: () => {
        const settings = this.options.originSettings;
        const disabled = settings.plotSaving || !settings.isConfigurable;
        this.updateInputWidget(xyPairsInput, {
          id: "settings-origin-plot-xy-pairs-input",
          value: this.options.xyPairsDraft,
          onChange: this.options.setXyPairsDraft,
          disabled,
        });
        this.updateInputWidget(commandInput, {
          id: "settings-origin-plot-command-input",
          value: this.options.plotCommandDraft,
          onChange: this.options.setPlotCommandDraft,
          disabled,
        });
        this.updateInputWidget(legendInput, {
          id: "settings-origin-legend-font-size-input",
          value: this.options.originLegendFontSizeDraft,
          onChange: this.options.setOriginLegendFontSizeDraft,
          placeholder: localize("chart.axis.auto", "auto"),
          disabled,
        });
        if (postCommandsTextarea.value !== this.options.postCommandsDraft) {
          postCommandsTextarea.value = this.options.postCommandsDraft;
        }
        postCommandsTextarea.disabled = disabled;
      },
    });
    return container;
  }

  private getOriginPlotSearchText(): string {
    return normalizeSettingsSearchText(
      localize("settings.origin.plot.title", "Default Plot Settings"),
      localize("settings.origin.plot.description", "Used by \"Open in Origin\"."),
      localize("settings.origin.plot.xyPairsLabel", "XY pairs"),
      localize("settings.origin.plot.xyPairsHint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4))."),
      localize("settings.origin.plot.commandLabel", "Plot command override"),
      localize("settings.origin.plot.commandHint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs."),
      localize("chart.legend.fontSize", "Legend size"),
      localize("settings.origin.plot.postCommandsLabel", "Post-plot commands"),
      localize("settings.origin.plot.postCommandsHint", "One LabTalk command per line, executed after plotting."),
    );
  }

  private createSelectWidget(options: FieldOptions, disposables?: DisposableStore): SelectBox<string> {
    const select = createSelectBox({
      id: options.id,
      className: "settings-select",
      disabled: options.disabled,
      value: options.value,
      options: options.options as readonly SelectBoxOption<string>[],
      onDidSelect: options.onChange,
    });
    if (disposables) {
      disposables.add(select);
    }
    else {
      this.registerContentDisposable(select);
    }
    return select;
  }

  private updateSelectWidget(select: SelectBox<string>, options: FieldOptions): void {
    select.update({
      id: options.id,
      className: "settings-select",
      disabled: options.disabled,
      value: options.value,
      options: options.options as readonly SelectBoxOption<string>[],
      onDidSelect: options.onChange,
    });
  }

  private createLocalSelectControl(
    itemId: SettingsContentItemId,
    getOptions: () => FieldOptions,
  ): HTMLButtonElement {
    const select = this.createSelectWidget(getOptions());
    this.registerLocalContentPatch(itemId, {
      element: select.domNode,
      getSearchText: () => normalizeSettingsSearchText(optionLabels(getOptions().options)),
      update: () => this.updateSelectWidget(select, getOptions()),
    });
    return select.domNode;
  }

  private createLocalButtonControl(
    itemId: SettingsContentItemId,
    getOptions: () => {
      readonly disabled?: boolean;
      readonly id: string;
      readonly label: string;
      readonly onClick: () => void;
      readonly variant: "primary" | "secondary";
    },
  ): HTMLButtonElement {
    const options = getOptions();
    const button = this.createButton({
      ...options,
      onClick: () => getOptions().onClick(),
    });
    this.registerLocalContentPatch(itemId, {
      element: button,
      getSearchText: () => getOptions().label,
      update: () => this.updateButton(button, getOptions()),
    });
    return button;
  }

  private createInputWidget(options: TextInputOptions): InputBox<HTMLInputElement> {
    const inputBox = this.registerContentDisposable(createInputBox({
      disabled: options.disabled,
      id: options.id,
      placeholder: options.placeholder,
      value: options.value,
    }));
    const input = inputBox.input;
    this.registerContentDisposable(addDisposableListener(input, "input", () => options.onChange(input.value)));
    if (options.onBlur) {
      this.registerContentDisposable(addDisposableListener(input, "blur", options.onBlur));
    }
    return inputBox;
  }

  private updateInputWidget(inputBox: InputBox<HTMLInputElement>, options: TextInputOptions): void {
    inputBox.update({
      disabled: options.disabled,
      id: options.id,
      placeholder: options.placeholder,
      value: options.value,
    });
  }

  private createLocalSwitchControl(options: {
    readonly ariaLabel: string;
    readonly getChecked: () => boolean;
    readonly getDisabled?: () => boolean | undefined;
    readonly id: string;
    readonly itemId: SettingsContentItemId;
    readonly onChange: (checked: boolean) => void;
  }): HTMLButtonElement {
    const widget = this.createSwitchWidget({
      ariaLabel: options.ariaLabel,
      checked: options.getChecked(),
      disabled: options.getDisabled?.(),
      id: options.id,
      onChange: options.onChange,
    });
    this.registerLocalContentPatch(options.itemId, {
      element: widget.domNode,
      getSearchText: () => undefined,
      update: () => this.updateSwitchWidget(widget, {
        ariaLabel: options.ariaLabel,
        checked: options.getChecked(),
        disabled: options.getDisabled?.(),
        id: options.id,
      }),
    });
    return widget.domNode;
  }

  private updateSwitchWidget(widget: SwitchWidget, options: {
    readonly ariaLabel: string;
    readonly checked: boolean;
    readonly disabled?: boolean;
    readonly id: string;
  }): void {
    widget.update({
      checked: options.checked,
      className: "settings-switch",
      disabled: options.disabled,
      id: options.id,
    });
    widget.domNode.setAttribute("aria-label", options.ariaLabel);
  }

  private createSwitchWidget(options: {
    ariaLabel: string;
    checked: boolean;
    disabled?: boolean;
    id: string;
    onChange: (checked: boolean) => void;
  }, disposables?: DisposableStore): SwitchWidget {
    const widget = new SwitchWidget({
      checked: options.checked,
      className: "settings-switch",
      disabled: options.disabled,
      id: options.id,
      onDidChangeChecked: options.onChange,
    });
    if (disposables) {
      disposables.add(widget);
    }
    else {
      this.registerContentDisposable(widget);
    }
    widget.domNode.setAttribute("aria-label", options.ariaLabel);
    return widget;
  }

  private renderBadgeColorSwatches(
    container: HTMLElement,
    buttons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    const swatchesContainer = container.querySelector<HTMLElement>(".settings-badge-color-options");
    const preview = container.querySelector<HTMLElement>(".settings-badge-preview");
    if (!swatchesContainer || !preview) {
      return;
    }

    const activeBadge = settings.explorerBadgeColorLabels.find(l => l.value === this.activeBadgeLabelValue) || settings.explorerBadgeColorLabels[0];
    const selectedColor = settings.explorerBadgeColors[this.activeBadgeLabelValue] ?? "neutral";

    preview.textContent = activeBadge ? activeBadge.label : this.activeBadgeLabelValue;
    preview.dataset.color = selectedColor;

    const nextColors = new Set<string>();
    for (const option of settings.explorerBadgeColorOptions) {
      nextColors.add(option.value);
      let button = buttons.get(option.value);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => {
          void this.options.appearanceSettings.onExplorerBadgeColorChange(this.activeBadgeLabelValue, option.value);
        });
        buttons.set(option.value, button);
      }
      button.className = "settings-badge-color-swatch";
      button.dataset.color = option.value;
      button.title = option.label;
      button.setAttribute(
        "aria-label",
        localize("settings.explorerBadgeColor.aria", "{badge} color: {color}", {
          badge: activeBadge ? activeBadge.label : this.activeBadgeLabelValue,
          color: option.label,
        }),
      );
      if (button.parentElement !== swatchesContainer) {
        swatchesContainer.appendChild(button);
      }
    }

    for (const [color, button] of Array.from(buttons)) {
      if (!nextColors.has(color)) {
        button.remove();
        buttons.delete(color);
      }
    }

    this.updateBadgeColorSwatches(preview, buttons, settings);
  }

  private updateBadgeColorSwatches(
    preview: HTMLElement | null,
    buttons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    const selectedColor = settings.explorerBadgeColors[this.activeBadgeLabelValue] ?? "neutral";
    if (preview) {
      preview.dataset.color = selectedColor;
    }
    for (const option of settings.explorerBadgeColorOptions) {
      const button = buttons.get(option.value);
      if (!button) {
        continue;
      }
      button.disabled = settings.isExplorerBadgeColorSaving;
      button.dataset.selected = String(option.value === selectedColor);
    }
  }

  private renderBackgroundSwatches(
    container: HTMLElement,
    swatchButtons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    const nextColors = new Set<string>();
    for (const color of settings.backgroundColorOptions) {
      nextColors.add(color);
      let button = swatchButtons.get(color);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => {
          void this.options.appearanceSettings.onBackgroundColorChange(color);
        });
        swatchButtons.set(color, button);
      }
      button.className = "settings-color-swatch";
      button.style.setProperty("--settings-swatch-color", color);
      button.setAttribute("aria-label", color);
      button.title = color;
      if (button.parentElement !== container) {
        container.append(button);
      }
    }

    for (const [color, button] of Array.from(swatchButtons)) {
      if (!nextColors.has(color)) {
        button.remove();
        swatchButtons.delete(color);
      }
    }

    this.updateBackgroundSwatches(swatchButtons, settings);
  }

  private updateBackgroundSwatches(
    swatchButtons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    for (const [color, button] of swatchButtons) {
      button.disabled = settings.isSaving;
      button.dataset.selected = String(color === settings.backgroundColor);
    }
  }

  private createButton(options: {
    disabled?: boolean;
    id: string;
    label: string;
    onClick: () => void;
    variant: "primary" | "secondary";
  }): HTMLButtonElement {
    const button = createActionButton({
      className: "settings-button",
      disabled: options.disabled === true,
      id: options.id,
      label: options.label,
      size: "sm",
      variant: options.variant,
    });
    button.addEventListener("click", options.onClick);
    return button;
  }

  private updateButton(button: HTMLButtonElement, options: {
    disabled?: boolean;
    id: string;
    label: string;
    variant: "primary" | "secondary";
  }): void {
    updateActionButton(button, {
      className: "settings-button",
      disabled: options.disabled === true,
      id: options.id,
      label: options.label,
      size: "sm",
      variant: options.variant,
    });
  }

}

export class SettingsNavigationView {
  private readonly disposables = new DisposableStore();
  private readonly root: HTMLElement;
  private clearSearchButton: HTMLButtonElement | null = null;
  private clearSearchSlot: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private options: SettingsViewOptions;

  constructor(container: HTMLElement, options: SettingsViewOptions) {
    this.root = document.createElement("aside");
    this.root.className = "settings-view-nav";
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  public update(options: SettingsViewOptions): void {
    const current = this.options;
    this.options = options;
    if (
      current.language !== options.language ||
      !settingsSectionsEqual(current.settingsSections, options.settingsSections)
    ) {
      this.render();
      return;
    }

    this.updateSelection();
    this.updateSearchState();
  }

  public dispose(): void {
    this.disposables.dispose();
    this.root.remove();
  }

  private render(): void {
    this.disposables.clear();
    this.root.setAttribute("aria-label", localize("settings.nav.ariaLabel", "Settings sections"));
    this.root.replaceChildren(
      div("settings-view-nav-header", this.createBackButton()),
      this.createSearch(),
      this.createNavigationList(),
    );
    this.updateSearchState();
  }

  private createBackButton(): HTMLButtonElement {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "settings-view-nav-back";
    backButton.addEventListener("click", () => void this.options.onNavigateBack());
    backButton.append(
      createLxIcon({ className: "settings-view-nav-back-icon", icon: LxIcon.arrowLeft, size: 14 }),
      text("span", "settings-view-nav-back-label", localize("settings.nav.back", "Back")),
    );
    return backButton;
  }

  private createSearch(): HTMLElement {
    const clearSearchButton = document.createElement("button");
    clearSearchButton.type = "button";
    clearSearchButton.className = "settings-view-search-clear";
    clearSearchButton.hidden = true;
    clearSearchButton.setAttribute("aria-label", localize("settings.nav.clearSearch", "Clear search"));
    clearSearchButton.appendChild(createLxIcon({ className: "settings-view-search-clear-icon", icon: LxIcon.close, size: 14 }));

    const searchInputBox = this.disposables.add(createInputBox({
      ariaLabel: localize("settings.nav.searchPlaceholder", "Search settings..."),
      left: createLxIcon({ className: "settings-view-search-icon", icon: LxIcon.search, size: 14 }),
      placeholder: localize("settings.nav.searchPlaceholder", "Search settings..."),
      right: clearSearchButton,
      type: "text",
      value: this.options.searchQuery,
    }));
    this.searchInput = searchInputBox.input;
    this.clearSearchButton = clearSearchButton;
    this.clearSearchSlot = clearSearchButton.parentElement as HTMLElement | null;

    this.disposables.add(addDisposableListener(searchInputBox.input, "input", () => {
      this.options.setSearchQuery(searchInputBox.input.value);
      this.updateSearchState();
    }));
    this.disposables.add(addDisposableListener(clearSearchButton, "click", () => {
      this.options.setSearchQuery("");
      this.updateSearchState();
      searchInputBox.input.focus();
    }));

    return div("settings-view-search", searchInputBox.element);
  }

  private createNavigationList(): HTMLElement {
    const nav = document.createElement("nav");
    nav.className = "settings-view-nav-list";
    const groups = createSettingsNavGroups();
    for (const group of groups) {
      const groupElement = div("settings-view-nav-group");
      const groupLabel = text("p", "settings-view-nav-group-label", group.label);
      const groupItems = div("settings-view-nav-group-items");
      for (const sectionId of group.sectionIds) {
        const section = this.options.settingsSections.find(item => item.id === sectionId);
        if (!section) {
          continue;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-view-nav-item";
        button.dataset.sectionId = section.id;
        button.append(
          createLxIcon({ className: "settings-view-nav-item-icon", icon: section.icon, size: 16 }),
          text("span", "settings-view-nav-item-label", section.label),
        );
        button.addEventListener("click", () => this.options.setActiveSettingsSection(section.id));
        groupItems.appendChild(button);
      }
      groupElement.append(groupLabel, groupItems);
      nav.appendChild(groupElement);
    }
    this.updateSelection(nav);
    return nav;
  }

  private updateSelection(root: ParentNode = this.root): void {
    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>(".settings-view-nav-item"))) {
      const isActive = button.dataset.sectionId === this.options.activeSettingsSection;
      button.dataset.selected = String(isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      }
      else {
        button.removeAttribute("aria-current");
      }
    }
  }

  private updateSearchState(): void {
    if (!this.searchInput || !this.clearSearchButton) {
      return;
    }

    if (this.searchInput.value !== this.options.searchQuery) {
      this.searchInput.value = this.options.searchQuery;
    }
    const queryWords = getSettingsSearchWords(this.options.searchQuery);
    this.clearSearchButton.hidden = queryWords.length === 0;
    if (this.clearSearchSlot) {
      this.clearSearchSlot.hidden = this.clearSearchButton.hidden;
    }
  }
}

function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  append(element, ...children);
  return element;
}

function cell(id: string, className: string): HTMLDivElement {
  const element = div(className ? `settings-cell ${className}` : "settings-cell");
  element.id = id;
  return element;
}

function title(value: string): HTMLElement {
  return text("h3", "settings-title", value);
}

function headingBlock(titleText: string, description: string): HTMLElement {
  return div("settings-heading", title(titleText), text("p", "settings-description", description));
}

function field(labelText: string, control: Node, hint?: string): HTMLElement {
  const element = div("settings-field");
  element.append(label(labelText), control);
  if (hint) {
    element.appendChild(text("p", "settings-hint", hint));
  }
  return element;
}

function label(value: string): HTMLElement {
  return text("p", "settings-label", value);
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

function isTemplateXAxisIntent(value: unknown): value is TemplateXAxisIntent {
  return value === "rawTransient" ||
    value === "ivCurve" ||
    value === "pvCurve" ||
    value === "cvCurve" ||
    value === "frequencySweep" ||
    value === "genericXY";
}

function getTemplateSemanticTermSearchText(term: TemplateActiveSemanticTerm): string {
  if (term.source === "builtin") {
    return `${term.term} ${term.canonicalRole} ${term.axisTendency}`;
  }
  return `${term.term} ${term.axisTendency}`;
}

function formatXAxisIntent(intent: TemplateXAxisIntent): string {
  if (intent === "rawTransient") {
    return localize("settings.template.intent.rawTransient", "Raw transient");
  }
  if (intent === "ivCurve") {
    return localize("settings.template.intent.ivCurve", "IV curve");
  }
  if (intent === "pvCurve") {
    return localize("settings.template.intent.pvCurve", "PV curve");
  }
  if (intent === "cvCurve") {
    return localize("settings.template.intent.cvCurve", "CV curve");
  }
  if (intent === "frequencySweep") {
    return localize("settings.template.intent.frequencySweep", "Frequency sweep");
  }
  return localize("settings.template.intent.genericXY", "Generic XY");
}

function formatDomainPackKind(kind: BuiltinSemanticDomainPack["kind"]): string {
  if (kind === "core") {
    return localize("settings.template.domainPacks.kind.core", "core");
  }
  if (kind === "domain") {
    return localize("settings.template.domainPacks.kind.domain", "domain");
  }
  if (kind === "format") {
    return localize("settings.template.domainPacks.kind.format", "format");
  }
  return localize("settings.template.domainPacks.kind.test", "test");
}

function formatDomainPackSearchText(pack: BuiltinSemanticDomainPack): string {
  return [
    pack.id,
    pack.label,
    pack.kind,
    pack.description,
    pack.rolePriors.join(" "),
    pack.intentPriors.join(" "),
    pack.patterns.join(" "),
  ].join(" ");
}

function updateSettingsTreeItemSearchText(item: SettingsTreeItem, searchText: string): SettingsTreeItem {
  if (item.kind === "element") {
    return {
      ...item,
      searchText,
    };
  }
  return {
    ...item,
    searchText,
  };
}

function settingsSectionsEqual(
  current: readonly SettingsSectionDefinition[],
  next: readonly SettingsSectionDefinition[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((option, index) => {
    const nextOption = next[index];
    if (!nextOption) {
      return false;
    }
    return option.groupId === nextOption.groupId &&
      option.icon === nextOption.icon &&
      option.id === nextOption.id &&
      option.label === nextOption.label &&
      option.order === nextOption.order;
  });
}

function optionLabels(options: readonly SelectOption[]): readonly string[] {
  return options.map(option => option.label);
}
