import { localize } from "src/cs/nls";
import { addDisposableListener, append, EventType, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton, updateButton as updateActionButton } from "src/cs/base/browser/ui/button/button";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
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
import { SettingsTreeModel } from "src/cs/workbench/contrib/settings/browser/settingsTreeModels";
import { settingsTreeRenderer } from "src/cs/workbench/contrib/settings/browser/settingsTreeRenderer";
import { isCustomSemanticMatchTermAllowed } from "src/cs/workbench/services/dataResource/common/semanticRules";
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

type TableColumnWidthSettings = {
  autoFitEnabled: boolean;
  isSaving: boolean;
  onAutoFitChange: (enabled: boolean) => Promise<void> | void;
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
  isSaving: boolean;
  onAddSemanticSectionItemTerm: (id: string, axis: TemplateSemanticAxis, value: string) => Promise<void> | void;
  onCommitSemanticSectionItemTitle: (id: string) => Promise<void> | void;
  onCreateSemanticSectionItem: () => Promise<void> | void;
  onMoveSemanticRulePriority: (ruleIds: readonly string[]) => Promise<void> | void;
  onRemoveSemanticRulePriorityItem: (id: string, source: "builtin" | "custom") => Promise<void> | void;
  onRemoveSemanticSectionItem: (id: string) => Promise<void> | void;
  onRemoveSemanticSectionItemTerm: (id: string, axis: TemplateSemanticAxis, term: string) => Promise<void> | void;
  onResetSemanticRules: () => Promise<void> | void;
  onUpdateSemanticSectionItemDraft: (id: string, field: TemplateSemanticSectionItemDraftField, value: string) => void;
  pendingActionItemId: string | null;
  rulePriorityItems: readonly TemplateSemanticRulePriorityItem[];
  semanticSectionItems: readonly TemplateSemanticSectionItem[];
};

type TemplateSemanticAxis = "proof" | "x" | "y";
type SettingsSectionItemEditState = "display" | "edit";
type TemplateSemanticSectionItemDraftField = "title" | "type" | "proofDraft" | "xDraft" | "yDraft";

type TemplateSemanticSectionItem = {
  readonly autoFocus?: boolean;
  readonly id: SettingsContentItemId;
  readonly isSaving: boolean;
  readonly ruleId: string;
  readonly source: "builtin" | "custom" | "draft";
  readonly title: string;
  readonly type?: string;
  readonly proofDraft: string;
  readonly proofTerms: readonly string[];
  readonly xDraft: string;
  readonly xTerms: readonly string[];
  readonly yDraft: string;
  readonly yTerms: readonly string[];
};

type TemplateSemanticRulePriorityItem = {
  readonly id: string;
  readonly source: "builtin" | "custom";
  readonly title: string;
  readonly type?: string;
  readonly proofTerms: readonly string[];
  readonly xTerms: readonly string[];
  readonly yTerms: readonly string[];
};

type SettingsViewProps = {
  appearanceSettings: AppearanceSettings;
  appUpdateSettings: AppUpdateSettings;
  chartDefaultSettings: ChartDefaultSettings;
  language: LanguagePreference;
  numericDisplaySettings: NumericDisplaySettings;
  tableColumnWidthSettings: TableColumnWidthSettings;
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
  handleCheckForUpdates: () => void;
  handleShowReleaseNotes: () => void;
  originLegendFontSizeDraft: string;
  plotCommandDraft: string;
  postCommandsDraft: string;
  setActiveSettingsSection: (section: SettingsSectionId) => void;
  searchQuery: string;
  setAxisTitleFontSizeDraft: (value: string) => void;
  setOriginLegendFontSizeDraft: (value: string) => void;
  setPlotCommandDraft: (value: string) => void;
  setPostCommandsDraft: (value: string) => void;
  setTickLabelFontSizeDraft: (value: string) => void;
  setSearchQuery: (value: string) => void;
  setXyPairsDraft: (value: string) => void;
  settingsSections: readonly SettingsSectionDefinition[];
  themeModeOptions: SelectOption[];
  tickLabelFontSizeDraft: string;
  windowCloseBehaviorOptions: SelectOption[];
  xyPairsDraft: string;
  yScaleOptions: SelectOption[];
};

export type SettingsContentDescriptorId =
  | "general-preferences"
  | "chart-defaults"
  | "template-preferences"
  | "template-semantic-rules"
  | "template-rule-priority"
  | "appearance-preferences"
  | "origin-integration"
  | "about";

export type SettingsContentItemId =
  | "settings-language-item"
  | "settings-close-behavior-item"
  | "settings-numeric-display-item"
  | "settings-table-auto-fit-columns-item"
  | "settings-default-transfer-y-scale-item"
  | "settings-default-output-y-scale-item"
  | "settings-default-cv-y-scale-item"
  | "settings-default-cf-y-scale-item"
  | "settings-default-pv-y-scale-item"
  | "settings-chart-defaults-item"
  | "settings-table-template-visualization-item"
  | "settings-template-rule-priority-item"
  | "settings-template-semantic-empty-item"
  | `settings-template-semantic-section-item:${string}`
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

type SettingsSectionItem<TRegion extends string = never> = {
  readonly element: HTMLElement;
  readonly leading: SettingsSectionItemLeading;
  readonly trailing: SettingsSectionItemTrailing<TRegion>;
};

type SettingsSectionItemLeading = {
  readonly descriptionElement?: HTMLElement;
  readonly element: HTMLElement;
  readonly labelElement: HTMLElement;
};

type SettingsSectionItemTrailing<TRegion extends string> = {
  readonly element: HTMLElement;
  readonly regions: Readonly<Record<TRegion, HTMLElement>>;
};

type SettingsSectionItemTrailingRegion<TRegion extends string> = {
  readonly className: string;
  readonly id: TRegion;
  readonly kind: "content" | "divider";
};

type LocalContentPatch = {
  readonly element: HTMLElement;
  readonly getSearchText: () => string | undefined;
  readonly treeItemId?: SettingsContentItemId;
  readonly update: () => void;
};

type TemplateSemanticSectionItemActions = {
  readonly element: HTMLElement;
  readonly removeAction: Action;
};

type TemplateSemanticSectionItemControls = {
  readonly leadingInput: InputBox<HTMLInputElement>;
  readonly sourceLabel: HTMLElement;
  readonly typeInput: InputBox<HTMLInputElement>;
  readonly proofInput: InputBoxWidget;
  readonly xInput: InputBoxWidget;
  readonly yInput: InputBoxWidget;
  readonly actions: TemplateSemanticSectionItemActions | null;
};

type SettingsSectionItemOrientation = "horizontal" | "vertical";

type SettingsSectionItemEditOptions = {
  readonly ariaLabel?: string;
  readonly onEdit?: () => Promise<void> | void;
  readonly state: SettingsSectionItemEditState;
};

type SettingsTreeListItemOptions = {
  readonly id: SettingsContentItemId;
  readonly description?: string;
  readonly groupId?: string;
  readonly label: string;
  readonly orientation: SettingsSectionItemOrientation;
  readonly searchText?: string;
  readonly trailingContent: HTMLElement;
};

type SettingsSectionItemContentOptions = {
  readonly id: SettingsContentItemId;
  readonly description?: string;
  readonly edit?: SettingsSectionItemEditOptions;
  readonly label: string;
  readonly orientation: SettingsSectionItemOrientation;
  readonly trailingContent: HTMLElement;
  readonly trailingRegions?: never;
};

type SettingsSectionItemRegionOptions<TRegion extends string> = {
  readonly id: SettingsContentItemId;
  readonly description?: string;
  readonly edit?: SettingsSectionItemEditOptions;
  readonly label: string;
  readonly orientation: SettingsSectionItemOrientation;
  readonly trailingClassName: string;
  readonly trailingRegions: readonly SettingsSectionItemTrailingRegion<TRegion>[];
  readonly trailingContent?: never;
};

type SettingsSectionItemOptions<TRegion extends string> =
  | SettingsSectionItemContentOptions
  | SettingsSectionItemRegionOptions<TRegion>;

function hasSettingsSectionItemRegions<TRegion extends string>(
  options: SettingsSectionItemOptions<TRegion>,
): options is SettingsSectionItemRegionOptions<TRegion> {
  return options.trailingRegions !== undefined;
}

export class SettingsView {
  private readonly descriptorDisposables = new Map<SettingsContentDescriptorId, DisposableStore>();
  private readonly descriptorItemIds = new Map<SettingsContentDescriptorId, Set<SettingsContentItemId>>();
  private readonly renderedDescriptorIds = new Set<SettingsContentDescriptorId>();
  private readonly contentDisposables = new DisposableStore();
  private readonly itemDisposables = new Map<SettingsContentItemId, DisposableStore>();
  private readonly localContentPatches = new Map<SettingsContentItemId, LocalContentPatch>();
  private readonly treeItems = new Map<SettingsContentItemId, SettingsTreeItem>();
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

    const itemIds = [...(this.descriptorItemIds.get(descriptorId) ?? [])];
    const treeItemIds = this.updateLocalContentItems({ descriptorId, itemIds });
    const treeItemIdSet = new Set(treeItemIds);
    const preservedItemIds = new Set(itemIds.filter(itemId => !treeItemIdSet.has(itemId)));
    const currentDisposables = this.collectDescriptorDisposables(descriptorId, preservedItemIds);
    const previousPatchIds = this.activeTreeItemPatchIds;
    this.activeTreeItemPatchIds = treeItemIdSet;
    let nextSections: readonly SettingsTreeSection[];
    try {
      nextSections = this.createVisibleContentTreeSections(false);
      tree.update(nextSections);
    }
    finally {
      this.activeTreeItemPatchIds = previousPatchIds;
      currentDisposables.dispose();
    }
    this.disposeDisconnectedPreservedItems(descriptorId, preservedItemIds, nextSections);
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

  private addContentDescriptorTreeElements(
    model: SettingsTreeModel,
    descriptor: SettingsContentDescriptor,
  ): void {
    const disposables = new DisposableStore();
    const previousDisposables = this.activeDescriptorDisposables;
    const previousDescriptorId = this.activeDescriptorId;
    this.activeDescriptorDisposables = disposables;
    this.activeDescriptorId = descriptor.id;
    try {
      this.addDescriptorTreeElements(model, descriptor.id);
      this.descriptorDisposables.set(descriptor.id, disposables);
      this.renderedDescriptorIds.add(descriptor.id);
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

  private collectDescriptorDisposables(
    descriptorId: SettingsContentDescriptorId,
    preservedItemIds: ReadonlySet<SettingsContentItemId> = new Set(),
  ): DisposableStore {
    const disposables = new DisposableStore();
    const itemIds = this.descriptorItemIds.get(descriptorId);
    const nextItemIds = new Set<SettingsContentItemId>();
    if (itemIds) {
      for (const itemId of itemIds) {
        if (preservedItemIds.has(itemId)) {
          nextItemIds.add(itemId);
          continue;
        }
        disposables.add(this.collectContentItemDisposables(itemId));
      }
    }
    if (nextItemIds.size) {
      this.descriptorItemIds.set(descriptorId, nextItemIds);
    }
    else {
      this.descriptorItemIds.delete(descriptorId);
    }
    const descriptorDisposables = this.descriptorDisposables.get(descriptorId);
    if (descriptorDisposables) {
      disposables.add(descriptorDisposables);
      this.descriptorDisposables.delete(descriptorId);
    }
    return disposables;
  }

  private disposeDisconnectedPreservedItems(
    descriptorId: SettingsContentDescriptorId,
    preservedItemIds: ReadonlySet<SettingsContentItemId>,
    nextSections: readonly SettingsTreeSection[],
  ): void {
    if (preservedItemIds.size === 0) {
      return;
    }

    const nextItemIds = new Set<SettingsContentItemId>();
    for (const section of nextSections) {
      for (const item of section.items) {
        nextItemIds.add(item.id as SettingsContentItemId);
      }
    }

    const descriptorItemIds = this.descriptorItemIds.get(descriptorId);
    for (const itemId of preservedItemIds) {
      if (nextItemIds.has(itemId)) {
        continue;
      }
      descriptorItemIds?.delete(itemId);
      this.collectContentItemDisposables(itemId).dispose();
    }
    if (descriptorItemIds?.size === 0) {
      this.descriptorItemIds.delete(descriptorId);
    }
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

  private createSettingsTreeListItem(options: SettingsTreeListItemOptions): SettingsTreeElementItem {
    const current = this.getReusableTreeItem(options.id, "element");
    if (current) {
      return current;
    }

    return this.createContentItem(options.id, () => {
      const sectionItem = this.createSettingsSectionItem(options);
      const item: SettingsTreeElementItem = {
        kind: "element",
        element: sectionItem.element,
        groupId: options.groupId,
        id: options.id,
        searchText: normalizeSettingsSearchText(options.label, options.description, options.searchText),
      };
      this.treeItems.set(options.id, item);
      return item;
    });
  }

  private createSettingsSectionItem<TRegion extends string = never>(
    options: SettingsSectionItemOptions<TRegion>,
  ): SettingsSectionItem<TRegion> {
    const element = cell(
      options.id,
      `settings-list-item-cell settings-list-item-cell--${options.orientation}`,
    );
    const content = div("settings-list-item-content");
    this.applySettingsSectionItemEditState(element, content, options);
    const labelElement = div(options.description ? "settings-list-item-leading settings-heading" : "settings-list-item-leading");
    const labelTitleElement = title(options.label);
    labelElement.appendChild(labelTitleElement);
    let descriptionElement: HTMLElement | undefined;
    if (options.description) {
      descriptionElement = text("p", "settings-description", options.description);
      labelElement.appendChild(descriptionElement);
    }
    const trailingElement = div("settings-list-item-trailing");
    const regions = Object.create(null) as Record<TRegion, HTMLElement>;
    if (hasSettingsSectionItemRegions(options)) {
      trailingElement.classList.add(options.trailingClassName);
      for (const region of options.trailingRegions) {
        const regionElement = div(region.className);
        if (region.kind === "divider") {
          regionElement.setAttribute("aria-hidden", "true");
        }
        regions[region.id] = regionElement;
        trailingElement.appendChild(regionElement);
      }
    }
    else {
      trailingElement.appendChild(options.trailingContent);
    }
    content.append(labelElement, trailingElement);
    element.appendChild(content);
    return {
      element,
      leading: {
        descriptionElement,
        element: labelElement,
        labelElement: labelTitleElement,
      },
      trailing: {
        element: trailingElement,
        regions,
      },
    };
  }

  private applySettingsSectionItemEditState<TRegion extends string>(
    element: HTMLElement,
    activationElement: HTMLElement,
    options: SettingsSectionItemOptions<TRegion>,
  ): void {
    if (!options.edit) {
      return;
    }
    element.classList.add("settings-list-item-cell--editable");
    element.classList.add(`settings-list-item-cell--editable-${options.edit.state}`);
    element.dataset.editState = options.edit.state;
    activationElement.classList.add("settings-list-item-content--editable");
    activationElement.classList.add(`settings-list-item-content--editable-${options.edit.state}`);
    if (options.edit.state !== "display") {
      return;
    }
    activationElement.tabIndex = 0;
    activationElement.setAttribute("role", "button");
    activationElement.setAttribute("aria-label", options.edit.ariaLabel ?? options.label);
    element.addEventListener("click", event => {
      if (isSettingsSectionItemEditActivationBlocked(event.target)) {
        return;
      }
      void options.edit?.onEdit?.();
    });
    activationElement.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      if (isSettingsSectionItemEditActivationBlocked(event.target)) {
        return;
      }
      event.preventDefault();
      void options.edit?.onEdit?.();
    });
  }

  private createSettingsTreeElementItem(options: {
    readonly bodyPadding?: "standard";
    readonly createElement: () => HTMLElement;
    readonly groupId?: string;
    readonly id: SettingsContentItemId;
    readonly searchText?: string;
  }): SettingsTreeElementItem {
    const current = this.getReusableTreeItem(options.id, "element");
    if (current) {
      return current;
    }

    return this.createContentItem(options.id, () => {
      const item: SettingsTreeElementItem = {
        bodyPadding: options.bodyPadding,
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
    this.renderSettingsContent(container, this.options.settingsSections.map(section => section.id), false);

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

  private createSettingsContentHeader(model: SettingsTreeModel): HTMLElement {
    const header = document.createElement("header");
    header.className = "settings-content-header";
    header.appendChild(text("h2", "settings-content-title", model.root.title));
    return header;
  }

  private getSettingsContentHeaderTitle(sectionIds: readonly SettingsSectionId[]): string {
    if (sectionIds.length === 1) {
      return this.getSectionLabel(sectionIds[0]!);
    }

    return localize("settings.content.title", "Settings");
  }

  private renderSettingsContent(container: HTMLElement, sectionIds: readonly SettingsSectionId[], renderHeader = true): void {
    const tree = this.registerContentDisposable(new SettingsTree(settingsTreeRenderer));
    const model = this.createSettingsTreeModel(sectionIds, true);
    if (renderHeader) {
      container.appendChild(this.createSettingsContentHeader(model));
    }
    tree.update(model.toSections());
    this.contentTree = tree;
    container.appendChild(tree.element);
  }

  private createVisibleContentTreeSections(initializeDescriptors: boolean): readonly SettingsTreeSection[] {
    const sectionIds = hasSettingsSearchQuery(this.options.searchQuery)
      ? this.options.settingsSections.map(section => section.id)
      : [this.options.activeSettingsSection];
    return this.createSettingsTreeModel(sectionIds, initializeDescriptors).toSections();
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

  private createSettingsTreeModel(
    sectionIds: readonly SettingsSectionId[],
    initializeDescriptors: boolean,
  ): SettingsTreeModel {
    const model = new SettingsTreeModel({
      id: "settings-tree-model",
      title: this.getSettingsContentHeaderTitle(sectionIds),
    });
    const descriptors = this.getContentDescriptorsForSections(sectionIds);
    for (const descriptor of descriptors) {
      if (initializeDescriptors) {
        this.addContentDescriptorTreeElements(model, descriptor);
      }
      else {
        this.withActiveDescriptor(descriptor.id, () => {
          this.renderedDescriptorIds.add(descriptor.id);
          this.addDescriptorTreeElements(model, descriptor.id);
        });
      }
    }
    return model;
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
        id: "template-semantic-rules",
        order: 20,
        sectionId: "template",
      },
      {
        id: "template-rule-priority",
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

  private addDescriptorTreeElements(model: SettingsTreeModel, descriptorId: SettingsContentDescriptorId): void {
    switch (descriptorId) {
      case "general-preferences":
        this.addGeneralSettingsTreeElements(model);
        return;
      case "chart-defaults":
        this.addChartSettingsTreeElements(model, this.options.chartDefaultSettings);
        return;
      case "template-preferences":
        this.addTemplateSettingsTreeElements(model);
        return;
      case "template-semantic-rules":
        this.addTemplateSemanticRulesSettingsTreeElements(model);
        return;
      case "template-rule-priority":
        this.addTemplateRulePrioritySettingsTreeElements(model);
        return;
      case "appearance-preferences":
        this.addAppearanceSettingsTreeElements(model);
        return;
      case "origin-integration":
        this.addOriginSettingsTreeElements(model);
        return;
      case "about":
        this.addAboutSettingsTreeElements(model);
        return;
    }

    throw new Error(`Settings descriptor ${descriptorId} does not own a settings tree.`);
  }

  private addGeneralSettingsTreeElements(model: SettingsTreeModel): void {
    const languageOptions = [
      { value: "system", label: localize("settings.language.system", "System") },
      { value: "zh", label: localize("settings.language.zh", "Chinese") },
      { value: "en", label: localize("settings.language.en", "English") },
    ];
    const section = {
      id: "settings-general-section",
    };
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-language-item",
      orientation: "horizontal",
      label: localize("settings.language.title", "Language"),
      description: localize("settings.language.description", "Choose the display language used by the app."),
      searchText: normalizeSettingsSearchText(optionLabels(languageOptions)),
      trailingContent: this.createLocalSelectControl("settings-language-item", () => ({
        id: "settings-language-dropdown",
        value: this.options.language,
        onChange: value => {
          if (value === "system" || value === "zh" || value === "en") {
            void this.options.onLanguageChange(value);
          }
        },
        options: languageOptions,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-close-behavior-item",
      orientation: "horizontal",
      label: localize("settings.closeBehavior.title", "Close Window"),
      description: localize("settings.closeBehavior.description", "Choose what happens when the main window is closed."),
      searchText: normalizeSettingsSearchText(optionLabels(this.options.windowCloseBehaviorOptions)),
      trailingContent: this.createLocalSelectControl("settings-close-behavior-item", () => ({
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
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-numeric-display-item",
      orientation: "horizontal",
      label: localize("settings.numericDisplay.title", "优化表格数值显示"),
      description: localize("settings.numericDisplay.description", "优化科学计数法以合适小数位显示以更好的预览"),
      trailingContent: this.createLocalSwitchControl({
        itemId: "settings-numeric-display-item",
        ariaLabel: localize("settings.numericDisplay.title", "优化表格数值显示"),
        getChecked: () => this.options.numericDisplaySettings.optimized,
        getDisabled: () => this.options.numericDisplaySettings.isSaving,
        id: "settings-numeric-display-toggle",
        onChange: checked => {
          void this.options.numericDisplaySettings.onOptimizedChange(checked);
        },
      }),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-table-auto-fit-columns-item",
      orientation: "horizontal",
      label: localize("settings.tableAutoFitColumns.title", "自动调整列宽"),
      description: localize("settings.tableAutoFitColumns.description", "开启后表格默认按内容自适应列宽。"),
      trailingContent: this.createLocalSwitchControl({
        itemId: "settings-table-auto-fit-columns-item",
        ariaLabel: localize("settings.tableAutoFitColumns.title", "自动调整列宽"),
        getChecked: () => this.options.tableColumnWidthSettings.autoFitEnabled,
        getDisabled: () => this.options.tableColumnWidthSettings.isSaving,
        id: "settings-table-auto-fit-columns-toggle",
        onChange: checked => {
          void this.options.tableColumnWidthSettings.onAutoFitChange(checked);
        },
      }),
    }));
  }

  private addTemplateSettingsTreeElements(model: SettingsTreeModel): void {
    const section = {
      id: "settings-template-section",
    };
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-table-template-visualization-item",
      orientation: "horizontal",
      label: localize("settings.tableTemplateVisualization.title", "Template Visualization"),
      description: localize("settings.tableTemplateVisualization.description", "Show the current template ranges on the table preview."),
      trailingContent: this.createLocalSwitchControl({
        itemId: "settings-table-template-visualization-item",
        ariaLabel: localize("settings.tableTemplateVisualization.title", "Template Visualization"),
        getChecked: () => this.options.tableTemplateVisualizationSettings.enabled,
        getDisabled: () => this.options.tableTemplateVisualizationSettings.isSaving,
        id: "settings-table-template-visualization-toggle",
        onChange: checked => {
          void this.options.tableTemplateVisualizationSettings.onEnabledChange(checked);
        },
      }),
    }));
  }

  private addTemplateSemanticRulesSettingsTreeElements(model: SettingsTreeModel): void {
    const settings = this.options.templateSettings;
    const groupId = "settings-template-semantic-rules";
    const section = {
      id: "settings-template-semantic-rules-section",
      title: localize("settings.template.semantic.rulesTitle", "Rules"),
      description: localize("settings.template.semantic.rulesDescription", "Define proof, X, and Y character blocks before Review builds binding candidates."),
      headerActions: [
        {
          id: "settings-template-semantic-reset-rules",
          label: localize("settings.template.semantic.resetRules", "Reset"),
          ariaLabel: localize("settings.template.semantic.resetRulesAria", "Reset built-in semantic rules"),
          disabled: settings.isSaving,
          icon: LxIcon.refresh,
          run: () => {
            void settings.onResetSemanticRules();
          },
        },
        {
          id: "settings-template-semantic-new-rule",
          label: localize("settings.template.semantic.newRule", "New"),
          ariaLabel: localize("settings.template.semantic.newRuleAria", "Create template semantic rule"),
          icon: LxIcon.add,
          run: () => {
            void settings.onCreateSemanticSectionItem();
          },
        },
      ],
    };
    if (!settings.semanticSectionItems.length) {
      model.addItemToSection(section, this.createSettingsTreeElementItem({
        id: "settings-template-semantic-empty-item",
        groupId,
        createElement: () => this.createTemplateSemanticEmptyItem(),
        searchText: this.getTemplateSemanticRulesSearchText(settings),
      }));
    }
    for (const item of settings.semanticSectionItems) {
      model.addItemToSection(section, this.createSettingsTreeElementItem({
        id: item.id,
        groupId,
        createElement: () => this.createTemplateSemanticSectionItem(item, settings),
        searchText: this.getTemplateSemanticSectionItemSearchText(item),
      }));
    }
  }

  private addTemplateRulePrioritySettingsTreeElements(model: SettingsTreeModel): void {
    const section = {
      id: "settings-template-rule-priority-section",
      title: localize("settings.template.rulePriority.title", "Rule Priority"),
      description: localize("settings.template.rulePriority.description", "Drag rule blocks to decide which matching rule wins when multiple rules fit the same data."),
    };
    model.addItemToSection(section, this.createSettingsTreeElementItem({
      id: "settings-template-rule-priority-item",
      bodyPadding: "standard",
      createElement: () => this.createTemplateRulePriority(this.options.templateSettings),
      searchText: this.getTemplateRulePrioritySearchText(this.options.templateSettings),
    }));
  }

  private createTemplateRulePriority(settings: TemplateSettings): HTMLElement {
    const inputBox = this.registerContentDisposable(new InputBoxWidget({
      ariaLabel: localize("settings.template.rulePriority.aria", "Rule priority order"),
      disabled: settings.isSaving,
      emptyLabel: localize("settings.template.rulePriority.empty", "No rules yet"),
      inputVisible: false,
      items: createTemplateRulePriorityInputItems(settings.rulePriorityItems),
      itemsReorderable: true,
    }));
    this.registerContentDisposable(inputBox.onDidMoveItem(event => {
      void settings.onMoveSemanticRulePriority(event.items.map(item => item.id));
    }));
    this.registerContentDisposable(inputBox.onDidRemoveItem(event => {
      const item = settings.rulePriorityItems.find(item => item.id === event.item.id);
      if (!item) {
        return;
      }
      void settings.onRemoveSemanticRulePriorityItem(item.id, item.source);
    }));
    this.registerLocalContentPatch("settings-template-rule-priority-item", {
      element: inputBox.element,
      getSearchText: () => this.getTemplateRulePrioritySearchText(this.options.templateSettings),
      update: () => {
        inputBox.update({
          ariaLabel: localize("settings.template.rulePriority.aria", "Rule priority order"),
          disabled: this.options.templateSettings.isSaving,
          emptyLabel: localize("settings.template.rulePriority.empty", "No rules yet"),
          inputVisible: false,
          items: createTemplateRulePriorityInputItems(this.options.templateSettings.rulePriorityItems),
          itemsReorderable: true,
        });
      },
    });
    return inputBox.element;
  }

  private createTemplateSemanticEmptyItem(): HTMLElement {
    return this.createSettingsSectionItem({
      id: "settings-template-semantic-empty-item",
      orientation: "vertical",
      label: localize("settings.template.semantic.noRulesTitle", "No Rules Yet"),
      description: localize("settings.template.semantic.noRulesDescription", "Create rules to give DataResource proof, X, and Y evidence before Review evaluates bindings."),
      trailingContent: div("settings-template-semantic-empty-spacer"),
    }).element;
  }

  private createTemplateSemanticSectionItem(
    semanticItem: TemplateSemanticSectionItem,
    settings: TemplateSettings,
  ): HTMLElement {
    const item = this.createSettingsSectionItem<"proof" | "x" | "y">({
      id: semanticItem.id,
      orientation: "vertical",
      label: localize("settings.template.semantic.ruleItemTitle", "Definition"),
      trailingClassName: "settings-template-semantic-rule-trailing",
      trailingRegions: [
        { id: "proof", className: "settings-template-semantic-axis-field", kind: "content" },
        { id: "x", className: "settings-template-semantic-axis-field", kind: "content" },
        { id: "y", className: "settings-template-semantic-axis-field", kind: "content" },
      ],
    });
    item.element.classList.add("settings-template-semantic-rule-item");
    const leadingInput = this.createTemplateSemanticSectionItemInput({
      ariaLabel: localize("settings.template.semantic.leadingAria", "Definition"),
      disabled: semanticItem.isSaving,
      placeholder: localize("settings.template.semantic.leadingPlaceholder", "Definition, for example iv transfer"),
      readOnly: false,
      value: semanticItem.title,
      onAccept: () => {
        void settings.onCommitSemanticSectionItemTitle(semanticItem.id);
      },
      onBlur: () => {
        void settings.onCommitSemanticSectionItemTitle(semanticItem.id);
      },
      onChange: value => settings.onUpdateSemanticSectionItemDraft(semanticItem.id, "title", value),
    });
    const typeInput = this.createTemplateSemanticSectionItemInput({
      ariaLabel: localize("settings.template.semantic.typeAria", "Type"),
      disabled: semanticItem.isSaving,
      placeholder: localize("settings.template.semantic.typePlaceholder", "Type, for example transfer"),
      readOnly: false,
      value: semanticItem.type ?? "",
      onAccept: () => {
        void settings.onCommitSemanticSectionItemTitle(semanticItem.id);
      },
      onBlur: () => {
        void settings.onCommitSemanticSectionItemTitle(semanticItem.id);
      },
      onChange: value => settings.onUpdateSemanticSectionItemDraft(semanticItem.id, "type", value),
    });
    const sourceLabel = text(
      "span",
      "settings-template-semantic-rule-source",
      formatTemplateSemanticSectionItemSource(semanticItem.source),
    );
    const leadingActions = this.createTemplateSemanticSectionItemActions(semanticItem, settings);
    const leadingContent = div(
      "settings-template-semantic-rule-leading-grid",
      sourceLabel,
      div("settings-template-semantic-rule-input-grid", leadingInput.element, typeInput.element),
      ...(leadingActions ? [leadingActions.element] : []),
    );
    item.leading.labelElement.replaceWith(leadingContent);
    if (item.leading.descriptionElement) {
      item.leading.descriptionElement.remove();
    }
    item.leading.element.classList.add("settings-template-semantic-rule-leading");

    const proofInput = this.createTemplateSemanticTermsInput({
      axis: "proof",
      ariaLabel: localize("settings.template.semantic.proofRepresentativeAria", "Proof representative character block"),
      disabled: semanticItem.isSaving,
      emptyLabel: localize("settings.template.semantic.noProofTerms", "No proof blocks"),
      placeholder: localize("settings.template.semantic.proofRepresentativePlaceholder", "Add proof field"),
      readOnly: false,
      terms: semanticItem.proofTerms,
      value: semanticItem.proofDraft,
      onAccept: value => settings.onAddSemanticSectionItemTerm(semanticItem.id, "proof", value),
      onChange: value => settings.onUpdateSemanticSectionItemDraft(semanticItem.id, "proofDraft", value),
      onRemoveTerm: term => settings.onRemoveSemanticSectionItemTerm(semanticItem.id, "proof", term),
    });
    item.trailing.regions.proof.appendChild(proofInput.element);
    const xInput = this.createTemplateSemanticTermsInput({
      axis: "x",
      ariaLabel: localize("settings.template.semantic.xRepresentativeAria", "X axis representative character block"),
      disabled: semanticItem.isSaving,
      emptyLabel: localize("settings.template.semantic.noXTerms", "No X blocks"),
      placeholder: localize("settings.template.semantic.xRepresentativePlaceholder", "Add X field"),
      readOnly: false,
      terms: semanticItem.xTerms,
      value: semanticItem.xDraft,
      onAccept: value => settings.onAddSemanticSectionItemTerm(semanticItem.id, "x", value),
      onChange: value => settings.onUpdateSemanticSectionItemDraft(semanticItem.id, "xDraft", value),
      onRemoveTerm: term => settings.onRemoveSemanticSectionItemTerm(semanticItem.id, "x", term),
    });
    item.trailing.regions.x.appendChild(xInput.element);
    const yInput = this.createTemplateSemanticTermsInput({
      axis: "y",
      ariaLabel: localize("settings.template.semantic.yRepresentativeAria", "Y axis representative character block"),
      disabled: semanticItem.isSaving,
      emptyLabel: localize("settings.template.semantic.noYTerms", "No Y blocks"),
      placeholder: localize("settings.template.semantic.yRepresentativePlaceholder", "Add Y field"),
      readOnly: false,
      terms: semanticItem.yTerms,
      value: semanticItem.yDraft,
      onAccept: value => settings.onAddSemanticSectionItemTerm(semanticItem.id, "y", value),
      onChange: value => settings.onUpdateSemanticSectionItemDraft(semanticItem.id, "yDraft", value),
      onRemoveTerm: term => settings.onRemoveSemanticSectionItemTerm(semanticItem.id, "y", term),
    });
    item.trailing.regions.y.appendChild(yInput.element);
    this.registerLocalContentPatch(semanticItem.id, {
      element: item.element,
      getSearchText: () => {
        const nextItem = this.options.templateSettings.semanticSectionItems.find(item => item.id === semanticItem.id);
        return nextItem ? this.getTemplateSemanticSectionItemSearchText(nextItem) : undefined;
      },
      update: () => {
        const nextItem = this.options.templateSettings.semanticSectionItems.find(item => item.id === semanticItem.id);
        if (!nextItem) {
          return;
        }
        this.updateTemplateSemanticSectionItemControls(nextItem, {
          leadingInput,
          sourceLabel,
          typeInput,
          proofInput,
          xInput,
          yInput,
          actions: leadingActions,
        });
      },
    });
    if (semanticItem.autoFocus) {
      queueMicrotask(() => leadingInput.focus());
    }
    return item.element;
  }

  private updateTemplateSemanticSectionItemControls(
    semanticItem: TemplateSemanticSectionItem,
    controls: TemplateSemanticSectionItemControls,
  ): void {
    controls.leadingInput.update({
      ariaLabel: localize("settings.template.semantic.leadingAria", "Definition"),
      disabled: semanticItem.isSaving,
      placeholder: localize("settings.template.semantic.leadingPlaceholder", "Definition, for example iv transfer"),
      readOnly: false,
      value: semanticItem.title,
    });
    controls.typeInput.update({
      ariaLabel: localize("settings.template.semantic.typeAria", "Type"),
      disabled: semanticItem.isSaving,
      placeholder: localize("settings.template.semantic.typePlaceholder", "Type, for example transfer"),
      readOnly: false,
      value: semanticItem.type ?? "",
    });
    const sourceText = formatTemplateSemanticSectionItemSource(semanticItem.source);
    if (controls.sourceLabel.textContent !== sourceText) {
      controls.sourceLabel.textContent = sourceText;
    }
    controls.proofInput.update({
      ariaLabel: localize("settings.template.semantic.proofRepresentativeAria", "Proof representative character block"),
      disabled: semanticItem.isSaving,
      emptyLabel: localize("settings.template.semantic.noProofTerms", "No proof blocks"),
      inputVisible: true,
      items: createTemplateSemanticTermItems("proof", semanticItem.proofTerms, false),
      placeholder: localize("settings.template.semantic.proofRepresentativePlaceholder", "Add proof field"),
      readOnly: false,
      value: semanticItem.proofDraft,
    });
    controls.xInput.update({
      ariaLabel: localize("settings.template.semantic.xRepresentativeAria", "X axis representative character block"),
      disabled: semanticItem.isSaving,
      emptyLabel: localize("settings.template.semantic.noXTerms", "No X blocks"),
      inputVisible: true,
      items: createTemplateSemanticTermItems("x", semanticItem.xTerms, false),
      placeholder: localize("settings.template.semantic.xRepresentativePlaceholder", "Add X field"),
      readOnly: false,
      value: semanticItem.xDraft,
    });
    controls.yInput.update({
      ariaLabel: localize("settings.template.semantic.yRepresentativeAria", "Y axis representative character block"),
      disabled: semanticItem.isSaving,
      emptyLabel: localize("settings.template.semantic.noYTerms", "No Y blocks"),
      inputVisible: true,
      items: createTemplateSemanticTermItems("y", semanticItem.yTerms, false),
      placeholder: localize("settings.template.semantic.yRepresentativePlaceholder", "Add Y field"),
      readOnly: false,
      value: semanticItem.yDraft,
    });
    if (controls.actions) {
      controls.actions.removeAction.enabled = !semanticItem.isSaving;
      controls.actions.removeAction.tooltip = localize("settings.template.semantic.removeRuleLabel", "Remove");
    }
  }

  private createTemplateSemanticSectionItemInput(options: {
    readonly ariaLabel: string;
    readonly disabled: boolean;
    readonly onAccept: () => void;
    readonly onBlur: () => void;
    readonly onChange: (value: string) => void;
    readonly placeholder: string;
    readonly readOnly: boolean;
    readonly value: string;
  }): InputBox<HTMLInputElement> {
    const inputBox = this.registerContentDisposable(createInputBox({
      ariaLabel: options.ariaLabel,
      disabled: options.disabled,
      placeholder: options.placeholder,
      readOnly: options.readOnly,
      value: options.value,
    }));
    inputBox.element.classList.add("settings-template-semantic-rule-input");
    let acceptedCurrentValue = false;
    this.registerContentDisposable(inputBox.onDidChange(value => {
      acceptedCurrentValue = false;
      options.onChange(value);
    }));
    this.registerContentDisposable(inputBox.onDidBlur(() => {
      if (acceptedCurrentValue) {
        return;
      }
      options.onBlur();
    }));
    this.registerContentDisposable(addDisposableListener(inputBox.input, EventType.KEY_DOWN, event => {
      if (event.key !== "Enter" || event.isComposing || inputBox.input.disabled || inputBox.input.readOnly) {
        return;
      }
      event.preventDefault();
      options.onAccept();
      if (!isCustomSemanticMatchTermAllowed(inputBox.value.trim())) {
        return;
      }
      acceptedCurrentValue = true;
      inputBox.blur();
    }));
    return inputBox;
  }

  private createTemplateSemanticTermsInput(options: {
    readonly ariaLabel: string;
    readonly axis: TemplateSemanticAxis;
    readonly disabled: boolean;
    readonly emptyLabel: string;
    readonly onAccept: (value: string) => void;
    readonly onChange: (value: string) => void;
    readonly onRemoveTerm: (term: string) => void;
    readonly placeholder: string;
    readonly readOnly: boolean;
    readonly terms: readonly string[];
    readonly value: string;
  }): InputBoxWidget {
    const inputBox = this.registerContentDisposable(new InputBoxWidget({
      ariaLabel: options.ariaLabel,
      disabled: options.disabled,
      emptyLabel: options.emptyLabel,
      inputVisible: !options.readOnly,
      items: createTemplateSemanticTermItems(options.axis, options.terms, options.readOnly),
      placeholder: options.placeholder,
      value: options.value,
    }));
    inputBox.element.classList.add("settings-template-semantic-rule-input");
    let acceptedCurrentValue = false;
    this.registerContentDisposable(inputBox.onDidChange(value => {
      acceptedCurrentValue = false;
      options.onChange(value);
    }));
    this.registerContentDisposable(addDisposableListener(inputBox.input, EventType.KEY_DOWN, event => {
      if (event.key !== "Enter" || event.isComposing || inputBox.input.disabled || inputBox.input.readOnly || inputBox.input.hidden) {
        return;
      }
      if (!inputBox.value.trim()) {
        return;
      }
      event.preventDefault();
      acceptedCurrentValue = true;
      options.onAccept(inputBox.value);
    }));
    this.registerContentDisposable(inputBox.onDidBlur(() => {
      if (acceptedCurrentValue) {
        return;
      }
      options.onAccept(inputBox.value);
    }));
    this.registerContentDisposable(inputBox.onDidRemoveItem(event => {
      options.onRemoveTerm(event.item.label);
    }));
    return inputBox;
  }

  private createTemplateSemanticSectionItemActions(
    semanticItem: TemplateSemanticSectionItem,
    settings: TemplateSettings,
  ): TemplateSemanticSectionItemActions | null {
    const actionLabel = localize("settings.template.semantic.removeRuleLabel", "Remove");
    const actionAriaLabel = getTemplateSemanticSectionItemRemoveAriaLabel(semanticItem);
    const removeAction = this.registerContentDisposable(new Action(
      "settings.template.semantic.removeRule",
      actionLabel,
      "",
      !semanticItem.isSaving,
      () => void settings.onRemoveSemanticSectionItem(semanticItem.id),
    ));
    removeAction.tooltip = actionLabel;
    removeAction.icon = LxIcon.trashFlat;

    const actionBar = this.registerContentDisposable(new ActionBar({
      ariaLabel: actionAriaLabel,
      className: "settings-template-semantic-rule-actionbar",
    }));
    actionBar.push(removeAction, {
      className: "settings-template-semantic-rule-action actionbaritem-delete",
      icon: true,
      label: false,
    });
    return {
      element: actionBar.domNode,
      removeAction,
    };
  }

  private getTemplateSemanticRulesSearchText(settings: TemplateSettings): string {
    return normalizeSettingsSearchText(
      localize("settings.template.semantic.rulesTitle", "Rules"),
      localize("settings.template.semantic.rulesDescription", "Define proof, X, and Y character blocks before Review builds binding candidates."),
      settings.semanticSectionItems.map(item => this.getTemplateSemanticSectionItemSearchText(item)).join(" "),
    );
  }

  private getTemplateSemanticSectionItemSearchText(item: TemplateSemanticSectionItem): string {
    return normalizeSettingsSearchText(
      item.title,
      item.type ?? "",
      item.proofTerms.join(" "),
      item.xTerms.join(" "),
      item.yTerms.join(" "),
      item.source,
    );
  }

  private getTemplateRulePrioritySearchText(settings: TemplateSettings): string {
    return normalizeSettingsSearchText(
      localize("settings.template.rulePriority.title", "Rule Priority"),
      localize("settings.template.rulePriority.description", "Drag rule blocks to decide which matching rule wins when multiple rules fit the same data."),
      settings.rulePriorityItems.map(item => [
        item.title,
        item.type ?? "",
        item.source,
        item.proofTerms.join(" "),
        item.xTerms.join(" "),
        item.yTerms.join(" "),
      ].join(" ")).join(" "),
    );
  }

  private addAppearanceSettingsTreeElements(model: SettingsTreeModel): void {
    const { appearanceSettings } = this.options;
    const section = {
      id: "settings-appearance-section",
    };
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-theme-item",
      orientation: "horizontal",
      label: localize("settings.theme.title", "Theme"),
      description: localize("settings.theme.description", "Choose the workbench color theme."),
      searchText: normalizeSettingsSearchText(optionLabels(this.options.themeModeOptions)),
      trailingContent: this.createLocalSelectControl("settings-theme-item", () => ({
        id: "settings-theme-dropdown",
        value: this.options.theme,
        onChange: value => {
          if (value === "system" || value === "light" || value === "dark") {
            void this.options.onThemeChange(value);
          }
        },
        options: this.options.themeModeOptions,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-explorer-density-item",
      orientation: "horizontal",
      label: localize("settings.explorerDensity.title", "Explorer Density"),
      description: localize("settings.explorerDensity.description", "Choose how compact file rows appear in Explorer."),
      searchText: normalizeSettingsSearchText(optionLabels(appearanceSettings.explorerDensityOptions)),
      trailingContent: this.createLocalSelectControl("settings-explorer-density-item", () => ({
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
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-explorer-badges-item",
      orientation: "horizontal",
      label: localize("settings.explorerBadges.title", "Explorer Badges"),
      description: localize("settings.explorerBadges.description", "Show measurement badges beside files in Explorer."),
      trailingContent: this.createLocalSwitchControl({
        itemId: "settings-explorer-badges-item",
        ariaLabel: localize("settings.explorerBadges.title", "Explorer Badges"),
        getChecked: () => this.options.appearanceSettings.showExplorerBadges,
        id: "settings-explorer-badges-toggle",
        onChange: checked => {
          void this.options.appearanceSettings.onExplorerBadgeVisibilityChange(checked);
        },
      }),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-explorer-badge-colors-item",
      orientation: "horizontal",
      label: localize("settings.explorerBadgeColors.title", "Badge Colors"),
      description: localize("settings.explorerBadgeColors.description", "Choose Explorer badge colors by measurement label."),
      searchText: normalizeSettingsSearchText(
        optionLabels(appearanceSettings.explorerBadgeColorLabels),
        optionLabels(appearanceSettings.explorerBadgeColorOptions),
      ),
      trailingContent: this.createBadgeColorControls(appearanceSettings),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-layout-item",
      orientation: "horizontal",
      label: localize("settings.layout.title", "Layout"),
      description: localize("settings.layout.description", "Reset sidebar width and hidden workbench parts."),
      trailingContent: this.createLayoutResetControl(),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-background-item",
      orientation: "horizontal",
      label: localize("settings.background.title", "Background"),
      description: localize("settings.background.description", "Choose the workbench page background color."),
      trailingContent: this.createBackgroundControls(appearanceSettings),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-transparent-chrome-item",
      orientation: "horizontal",
      label: localize("settings.transparentChrome.title", "Translucent sidebar"),
      description: localize("settings.transparentChrome.description", "Let the sidebar blend with the desktop window surface."),
      trailingContent: this.createLocalSwitchControl({
        itemId: "settings-transparent-chrome-item",
        ariaLabel: localize("settings.transparentChrome.title", "Translucent sidebar"),
        getChecked: () => this.options.appearanceSettings.transparentChrome,
        id: "settings-transparent-chrome-toggle",
        onChange: checked => {
          void this.options.appearanceSettings.onTransparentChromeChange(checked);
        },
      }),
    }));
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

  private addOriginSettingsTreeElements(model: SettingsTreeModel): void {
    const section = {
      id: "settings-origin-section",
    };
    model.addItemToSection(section, this.createSettingsTreeElementItem({
      id: "settings-origin-path-item",
      createElement: () => this.createOriginPathItem(this.options.originSettings),
      searchText: this.getOriginPathSearchText(this.options.originSettings),
    }));
    model.addItemToSection(section, this.createSettingsTreeElementItem({
      id: "settings-origin-cleanup-item",
      createElement: () => this.createOriginCleanupItem(this.options.originSettings),
      searchText: this.getOriginCleanupSearchText(),
    }));
    model.addItemToSection(section, this.createSettingsTreeElementItem({
      id: "settings-origin-plot-item",
      createElement: () => this.createOriginPlot(this.options.originSettings),
      searchText: this.getOriginPlotSearchText(),
    }));
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

  private addAboutSettingsTreeElements(model: SettingsTreeModel): void {
    const { appUpdateSettings } = this.options;
    const section = {
      id: "settings-about-section",
    };
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-about-version-item",
      orientation: "horizontal",
      label: localize("settings.about.versionTitle", "Current Version"),
      description: localize("settings.about.versionDescription", "The installed Conductor Studio version."),
      trailingContent: text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings.about.versionUnknown", "Unknown")),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-release-notes-item",
      orientation: "horizontal",
      label: localize("settings.releaseNotes.title", "Release Notes"),
      description: localize("settings.releaseNotes.description", "Review recent product changes and fixes."),
      searchText: localize("settings.releaseNotes.showButton", "Show Release Notes"),
      trailingContent: this.createButton({
        id: "settings-release-notes-show-btn",
        label: localize("settings.releaseNotes.showButton", "Show Release Notes"),
        onClick: this.options.handleShowReleaseNotes,
        variant: "secondary",
      }),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-user-guide-item",
      orientation: "horizontal",
      label: localize("settings.userGuide.title", "User Guide"),
      description: localize("settings.userGuide.description", "Open the bundled guide for common workflows."),
      searchText: localize("settings.userGuide.showButton", "Show User Guide"),
      trailingContent: this.createButton({
        id: "settings-user-guide-show-btn",
        label: localize("settings.userGuide.showButton", "Show User Guide"),
        onClick: () => this.showUserGuideDialog(),
        variant: "secondary",
      }),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-app-update-item",
      orientation: "horizontal",
      label: localize("settings.appUpdate.title", "App Updates"),
      description: localize("settings.appUpdate.description", "Check whether a newer version is available."),
      searchText: localize("settings.appUpdate.checkButton", "Check for Updates"),
      trailingContent: this.createLocalButtonControl("settings-app-update-item", () => ({
        id: "settings-app-update-check-btn",
        label: this.options.appUpdateChecking ? localize("settings.appUpdate.checking", "Checking...") : localize("settings.appUpdate.checkButton", "Check for Updates"),
        onClick: this.options.handleCheckForUpdates,
        disabled: !this.options.appUpdateSettings.isAvailable || this.options.appUpdateChecking,
        variant: "secondary",
      })),
    }));
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

  private addChartSettingsTreeElements(model: SettingsTreeModel, settings: ChartDefaultSettings): void {
    const section = {
      id: "settings-chart-section",
      title: localize("settings.chartDefaults.sectionTitle", "Chart"),
    };
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-default-transfer-y-scale-item",
      orientation: "horizontal",
      label: localize("settings.chartScaleDefaults.transferCurve", "Transfer"),
      description: localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
      searchText: normalizeSettingsSearchText(optionLabels(this.options.yScaleOptions)),
      trailingContent: this.createLocalSelectControl("settings-default-transfer-y-scale-item", () => ({
        id: "settings-default-transfer-y-scale-select",
        value: this.options.chartDefaultSettings.defaultYScaleForTransfer,
        onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForTransferChange(value),
        options: this.options.yScaleOptions,
        disabled: this.options.chartDefaultSettings.isSaving,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-default-output-y-scale-item",
      orientation: "horizontal",
      label: localize("settings.chartScaleDefaults.outputCurve", "Output"),
      searchText: normalizeSettingsSearchText(
        localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
        optionLabels(this.options.yScaleOptions),
      ),
      trailingContent: this.createLocalSelectControl("settings-default-output-y-scale-item", () => ({
        id: "settings-default-output-y-scale-select",
        value: this.options.chartDefaultSettings.defaultYScaleForOutput,
        onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForOutputChange(value),
        options: this.options.yScaleOptions,
        disabled: this.options.chartDefaultSettings.isSaving,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-default-cv-y-scale-item",
      orientation: "horizontal",
      label: localize("settings.chartScaleDefaults.cvCurve", "C-V"),
      searchText: normalizeSettingsSearchText(
        localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
        optionLabels(this.options.yScaleOptions),
      ),
      trailingContent: this.createLocalSelectControl("settings-default-cv-y-scale-item", () => ({
        id: "settings-default-cv-y-scale-select",
        value: this.options.chartDefaultSettings.defaultYScaleForCv,
        onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForCvChange(value),
        options: this.options.yScaleOptions,
        disabled: this.options.chartDefaultSettings.isSaving,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-default-cf-y-scale-item",
      orientation: "horizontal",
      label: localize("settings.chartScaleDefaults.cfCurve", "C-f"),
      searchText: normalizeSettingsSearchText(
        localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
        optionLabels(this.options.yScaleOptions),
      ),
      trailingContent: this.createLocalSelectControl("settings-default-cf-y-scale-item", () => ({
        id: "settings-default-cf-y-scale-select",
        value: this.options.chartDefaultSettings.defaultYScaleForCf,
        onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForCfChange(value),
        options: this.options.yScaleOptions,
        disabled: this.options.chartDefaultSettings.isSaving,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeListItem({
      id: "settings-default-pv-y-scale-item",
      orientation: "horizontal",
      label: localize("settings.chartScaleDefaults.pvCurve", "P-V"),
      searchText: normalizeSettingsSearchText(
        localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
        optionLabels(this.options.yScaleOptions),
      ),
      trailingContent: this.createLocalSelectControl("settings-default-pv-y-scale-item", () => ({
        id: "settings-default-pv-y-scale-select",
        value: this.options.chartDefaultSettings.defaultYScaleForPv,
        onChange: value => void this.options.chartDefaultSettings.onDefaultYScaleForPvChange(value),
        options: this.options.yScaleOptions,
        disabled: this.options.chartDefaultSettings.isSaving,
      })),
    }));
    model.addItemToSection(section, this.createSettingsTreeElementItem({
      id: "settings-chart-defaults-item",
      createElement: () => this.createChartDefaults(settings),
      searchText: this.getChartDefaultsSearchText(),
    }));
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
    });
    if (disposables) {
      disposables.add(select);
      disposables.add(select.onDidSelect(options.onChange));
    }
    else {
      this.registerContentDisposable(select);
      this.registerContentDisposable(select.onDidSelect(options.onChange));
    }
    return select;
  }

  private updateSelectWidget(select: SelectBox<string>, options: FieldOptions): void {
    select.setOptions(options.options as readonly SelectBoxOption<string>[], options.value);
    select.setEnabled(!options.disabled);
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

function isSettingsSectionItemEditActivationBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const interactiveElement = target.closest("a,button,input,select,textarea");
  if (!interactiveElement) {
    return false;
  }
  if (interactiveElement instanceof HTMLInputElement && (interactiveElement.readOnly || interactiveElement.disabled)) {
    return false;
  }
  return true;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

function formatTemplateSemanticSectionItemSource(source: TemplateSemanticSectionItem["source"]): string {
  return source === "builtin"
    ? localize("settings.template.semantic.sourceHome", "Home")
    : localize("settings.template.semantic.sourceUser", "User");
}

function createTemplateSemanticTermItems(
  axis: TemplateSemanticAxis,
  terms: readonly string[],
  readOnly: boolean,
): readonly IInputBoxWidgetItem[] {
  return terms.map((term, index) => {
    const item = {
      id: `${axis}:${index}:${term}`,
      label: term,
      kind: axis,
    };
    if (readOnly) {
      return item;
    }
    return {
      ...item,
      removable: true,
      removeAriaLabel: localize("settings.template.semantic.removeTerm", "Remove character block {term}", { term }),
    };
  });
}

function createTemplateRulePriorityInputItems(
  items: readonly TemplateSemanticRulePriorityItem[],
): readonly IInputBoxWidgetItem[] {
  return items.map(item => ({
    id: item.id,
    label: item.title,
    kind: item.source,
    ariaLabel: item.title.trim()
      ? localize("settings.template.rulePriority.ruleAria", "Rule priority block {title}", { title: item.title })
      : localize("settings.template.rulePriority.untitledRuleAria", "Untitled rule priority block"),
    removable: true,
    removeAriaLabel: item.title.trim()
      ? localize("settings.template.rulePriority.remove", "Remove rule {title}", { title: item.title })
      : localize("settings.template.rulePriority.removeUntitled", "Remove rule"),
  }));
}

function getTemplateSemanticSectionItemRemoveAriaLabel(
  semanticItem: TemplateSemanticSectionItem,
): string {
  return semanticItem.title.trim()
    ? localize("settings.template.semantic.removeRule", "Remove domain rule {term}", { term: semanticItem.title })
    : localize("settings.template.semantic.removeUntitledRule", "Remove domain rule");
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
