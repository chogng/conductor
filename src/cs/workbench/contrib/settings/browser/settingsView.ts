import { localize } from "src/cs/nls";
import { addDisposableListener, append, EventType, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton } from "src/cs/base/browser/ui/button/button";
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
import { createInputBox } from "src/cs/base/browser/ui/inputbox/inputBox";
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
  TemplateSemanticColumnRole,
  TemplateSemanticFamily,
  TemplateSemanticIvMode,
  TemplateSemanticMatchPolicy,
  TemplateSemanticUnit,
  TemplateXAxisIntent,
} from "src/cs/workbench/services/settings/common/settings";
import type {
  DataResourceBuiltinSemanticDomainPack,
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
  setSettingsSearchText,
  type SettingsSearchTerm,
  settingsSearchMatches,
} from "src/cs/workbench/contrib/settings/browser/settingsSearch";
import {
  SettingsTree,
  type SettingsTreeControlItem,
  type SettingsTreeElementItem,
  type SettingsTreeItem,
  type SettingsTreeSection,
} from "src/cs/workbench/contrib/settings/browser/settingsTree";
import type { LanguagePreference } from "src/cs/base/common/platform";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type {
  Feedback,
} from "src/cs/workbench/contrib/settings/common/feedback";
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
  cleanupFeedback?: Feedback;
  cleanupKeepSuccessJobs: number;
  cleanupRunning: boolean;
  cleanupSaving: boolean;
  feedback: Feedback;
  isConfigurable: boolean;
  isHealthCheckAvailable: boolean;
  isCleanupAvailable: boolean;
  isHealthChecking: boolean;
  isLoading: boolean;
  plotCommand: string;
  plotFeedback?: Feedback;
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
  feedback: Feedback;
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
  feedback: Feedback;
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
  builtinDomainPacks: readonly DataResourceBuiltinSemanticDomainPack[];
  disabledDomainPackIds: readonly string[];
  disabledBuiltinTermIds: readonly string[];
  familyOptions: readonly SelectOption[];
  feedback: Feedback;
  intentOptions: readonly SelectOption[];
  isSaving: boolean;
  ivModeOptions: readonly SelectOption[];
  matchPolicyOptions: readonly SelectOption[];
  onAddSemanticTerm: () => Promise<void> | void;
  onDisableBuiltinTerm: (id: string) => Promise<void> | void;
  onDisableDomainPack: (id: string) => Promise<void> | void;
  onEnableBuiltinTerm: (id: string) => Promise<void> | void;
  onEnableDomainPack: (id: string) => Promise<void> | void;
  onMoveXAxisIntent: (sourceIntent: TemplateXAxisIntent, targetIntent: TemplateXAxisIntent) => Promise<void> | void;
  onRemoveSemanticTerm: (id: string) => Promise<void> | void;
  roleOptions: readonly SelectOption[];
  unitOptions: readonly SelectOption[];
  xAxisIntentPriority: readonly TemplateXAxisIntent[];
};

type TemplateActiveSemanticTerm =
  | (TemplateSemanticTerm & { readonly source: "custom" })
  | (TemplateBuiltinSemanticTerm & { readonly source: "builtin" });

type TemplateSemanticTerm = {
  readonly id: string;
  readonly term: string;
  readonly canonicalRole: TemplateSemanticColumnRole;
  readonly canonicalUnit?: TemplateSemanticUnit;
  readonly axisTendency: TemplateSemanticAxisTendency;
  readonly family?: TemplateSemanticFamily;
  readonly ivMode?: TemplateSemanticIvMode;
  readonly intent?: TemplateXAxisIntent;
  readonly matchPolicy: TemplateSemanticMatchPolicy;
  readonly enabled: boolean;
};

type TemplateBuiltinSemanticTerm = Omit<TemplateSemanticTerm, "enabled" | "intent" | "matchPolicy"> & {
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
  setAxisTitleFontSizeDraft: (value: string) => void;
  setFileNameFieldSeparatorsDraft: (value: string) => void;
  setOriginLegendFontSizeDraft: (value: string) => void;
  setPlotCommandDraft: (value: string) => void;
  setPostCommandsDraft: (value: string) => void;
  setTemplateSemanticTermDraft: (value: string) => void;
  setTemplateSemanticAxisDraft: (value: string) => void;
  setTemplateSemanticFamilyDraft: (value: string) => void;
  setTemplateSemanticIntentDraft: (value: string) => void;
  setTemplateSemanticIvModeDraft: (value: string) => void;
  setTemplateSemanticMatchPolicyDraft: (value: string) => void;
  setTemplateSemanticRoleDraft: (value: string) => void;
  setTemplateSemanticUnitDraft: (value: string) => void;
  setTickLabelFontSizeDraft: (value: string) => void;
  setXyPairsDraft: (value: string) => void;
  settingsSections: readonly SettingsSectionDefinition[];
  themeModeOptions: SelectOption[];
  templateSemanticTermDraft: string;
  templateSemanticAxisDraft: TemplateSemanticAxisTendency;
  templateSemanticFamilyDraft: TemplateSemanticFamily | "";
  templateSemanticIntentDraft: TemplateXAxisIntent | "";
  templateSemanticIvModeDraft: TemplateSemanticIvMode | "";
  templateSemanticMatchPolicyDraft: TemplateSemanticMatchPolicy;
  templateSemanticRoleDraft: TemplateSemanticColumnRole;
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
  | "settings-language-card"
  | "settings-close-behavior-card"
  | "settings-numeric-display-card"
  | "settings-default-transfer-y-scale-card"
  | "settings-default-output-y-scale-card"
  | "settings-default-cv-y-scale-card"
  | "settings-default-cf-y-scale-card"
  | "settings-default-pv-y-scale-card"
  | "settings-chart-scale-feedback-card"
  | "settings-chart-defaults-card"
  | "settings-table-template-visualization-card"
  | "settings-filename-matching-card"
  | "settings-template-domain-packs-card"
  | "settings-template-x-axis-priority-card"
  | "settings-template-semantic-library-card"
  | "settings-theme-card"
  | "settings-explorer-density-card"
  | "settings-explorer-badges-card"
  | "settings-explorer-badge-colors-card"
  | "settings-layout-card"
  | "settings-background-card"
  | "settings-transparent-chrome-card"
  | "settings-origin-path-card"
  | "settings-origin-cleanup-card"
  | "settings-origin-plot-card"
  | "settings-about-version-card"
  | "settings-release-notes-card"
  | "settings-user-guide-card"
  | "settings-app-update-card";

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
  readonly create: () => HTMLElement;
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
  monospace?: boolean;
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

export class SettingsView {
  private readonly layoutDisposables = new DisposableStore();
  private readonly descriptorDisposables = new Map<SettingsContentDescriptorId, DisposableStore>();
  private readonly descriptorElements = new Map<SettingsContentDescriptorId, HTMLElement>();
  private readonly descriptorItemIds = new Map<SettingsContentDescriptorId, Set<SettingsContentItemId>>();
  private readonly descriptorTrees = new Map<SettingsContentDescriptorId, SettingsTree>();
  private readonly contentDisposables = new DisposableStore();
  private readonly itemDisposables = new Map<SettingsContentItemId, DisposableStore>();
  private readonly treeItems = new Map<SettingsContentItemId, SettingsTreeItem>();
  private readonly root: HTMLElement;
  private readonly contentScroll = new Scrollbar({
    className: "settings-view-content-scroll",
    viewportClassName: "settings-view-content-scroll-viewport",
  });
  private contentElement: HTMLElement | null = null;
  private activeDescriptorId: SettingsContentDescriptorId | null = null;
  private activeDescriptorDisposables: DisposableStore | null = null;
  private activeItemDisposables: DisposableStore | null = null;
  private activeTreeItemPatchIds: Set<SettingsContentItemId> | null = null;
  private options: SettingsViewOptions;
  private activeBadgeLabelValue = "transfer";
  private searchQuery = "";
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

    this.updateNavSelection();

    if (current.activeSettingsSection !== options.activeSettingsSection) {
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
    this.layoutDisposables.dispose();
    this.clearDescriptorTemplates();
    this.contentDisposables.dispose();
    this.contentScroll.dispose();
    this.root.remove();
  }

  private render(): void {
    this.layoutDisposables.clear();
    this.clearDescriptorTemplates();
    this.contentDisposables.clear();
    this.contentElement = null;
    reset(this.root);
    this.root.appendChild(this.createLayout());
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
    const currentElement = this.descriptorElements.get(descriptorId);
    if (!currentElement) {
      return;
    }

    const descriptor = this.createContentDescriptors().find(candidate => candidate.id === descriptorId);
    if (!descriptor) {
      return;
    }

    const currentDisposables = this.collectDescriptorDisposables(descriptorId);
    const nextElement = this.createContentDescriptorElement(descriptor);
    currentElement.replaceWith(nextElement);
    currentDisposables.dispose();
  }

  private updateContentItems(target: SettingsContentItemTarget): void {
    this.updateSettingsTreeItems(target);
  }

  private updateSettingsTreeItems(target: SettingsContentItemTarget): void {
    const tree = this.descriptorTrees.get(target.descriptorId);
    if (!tree) {
      return;
    }

    const itemIds = new Set(target.itemIds);
    const currentDisposables = target.itemIds
      .map(itemId => this.collectContentItemDisposables(itemId));
    const previousPatchIds = this.activeTreeItemPatchIds;
    this.activeTreeItemPatchIds = itemIds;
    try {
      this.withActiveDescriptor(target.descriptorId, () => {
        tree.updateItems(this.createDescriptorTreeSections(target.descriptorId), target.itemIds);
      });
    }
    finally {
      this.activeTreeItemPatchIds = previousPatchIds;
    }
    for (const disposables of currentDisposables) {
      disposables.dispose();
    }
  }

  private updateSearchResults(): void {
    if (!this.contentElement || !hasSettingsSearchQuery(this.searchQuery)) {
      return;
    }

    for (const empty of Array.from(this.contentElement.querySelectorAll<HTMLElement>(".settings-search-empty"))) {
      empty.remove();
    }

    const resultCount = this.filterSearchResults(this.contentElement, getSettingsSearchWords(this.searchQuery));
    if (resultCount === 0) {
      this.contentElement.appendChild(this.createEmptySearchResults());
    }
  }

  private createContentDescriptorElement(descriptor: SettingsContentDescriptor): HTMLElement {
    const disposables = new DisposableStore();
    const previousDisposables = this.activeDescriptorDisposables;
    const previousDescriptorId = this.activeDescriptorId;
    this.activeDescriptorDisposables = disposables;
    this.activeDescriptorId = descriptor.id;
    try {
      const element = descriptor.create();
      this.descriptorDisposables.set(descriptor.id, disposables);
      this.descriptorElements.set(descriptor.id, element);
      return element;
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
    ]);
    for (const descriptorId of descriptorIds) {
      this.collectDescriptorDisposables(descriptorId).dispose();
    }
  }

  private registerContentDisposable<T extends IDisposable>(disposable: T): T {
    const disposables = this.activeItemDisposables ?? this.activeDescriptorDisposables ?? this.contentDisposables;
    return disposables.add(disposable);
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
    this.descriptorTrees.delete(descriptorId);
    this.descriptorElements.delete(descriptorId);
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

  private createSettingsTreeControlItem(options: {
    readonly id: SettingsContentItemId;
    readonly createControl: () => HTMLElement;
    readonly description?: string;
    readonly searchText?: string;
    readonly title: string;
  }): SettingsTreeControlItem {
    const current = this.getReusableTreeItem(options.id, "control");
    if (current) {
      return current;
    }

    return this.createContentItem(options.id, () => {
      const item: SettingsTreeControlItem = {
        kind: "control",
        control: options.createControl(),
        description: options.description,
        id: options.id,
        searchText: options.searchText,
        title: options.title,
      };
      this.treeItems.set(options.id, item);
      return item;
    });
  }

  private createSettingsTreeElementItem(options: {
    readonly id: SettingsContentItemId;
    readonly createElement: () => HTMLElement;
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

  private createLayout(): HTMLElement {
    const layout = div("settings-view-layout");
    layout.append(this.createNav(), this.createContentScroll());
    return layout;
  }

  private createContentScroll(): HTMLElement {
    this.contentElement = this.createContent();
    this.contentScroll.viewport.replaceChildren(this.contentElement);
    return this.contentScroll.element;
  }

  private createNav(): HTMLElement {
    const aside = document.createElement("aside");
    aside.className = "settings-view-nav";
    aside.setAttribute("aria-label", localize("settings.nav.ariaLabel", "Settings sections"));

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "settings-view-nav-back";
    backButton.addEventListener("click", () => void this.options.onNavigateBack());
    backButton.append(
      createLxIcon({ className: "settings-view-nav-back-icon", icon: LxIcon.arrowLeft, size: 14 }),
      text("span", "settings-view-nav-back-label", localize("settings.nav.back", "Back")),
    );

    const clearSearchButton = document.createElement("button");
    clearSearchButton.type = "button";
    clearSearchButton.className = "settings-view-search-clear";
    clearSearchButton.hidden = true;
    clearSearchButton.setAttribute("aria-label", localize("settings.nav.clearSearch", "Clear search"));
    clearSearchButton.appendChild(createLxIcon({ className: "settings-view-search-clear-icon", icon: LxIcon.close, size: 14 }));
    const searchInputBox = this.layoutDisposables.add(createInputBox({
      ariaLabel: localize("settings.nav.searchPlaceholder", "Search settings..."),
      left: createLxIcon({ className: "settings-view-search-icon", icon: LxIcon.search, size: 14 }),
      placeholder: localize("settings.nav.searchPlaceholder", "Search settings..."),
      right: clearSearchButton,
      type: "text",
      value: this.searchQuery,
    }));
    const searchInput = searchInputBox.input;
    const clearSearchSlot = clearSearchButton.parentElement as HTMLElement | null;
    const search = div("settings-view-search", searchInputBox.element);

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

        const isActive = this.options.activeSettingsSection === section.id;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-view-nav-item";
        button.dataset.sectionId = section.id;
        button.dataset.selected = String(isActive);
        if (isActive) {
          button.setAttribute("aria-current", "page");
        }
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

    const updateSearchState = () => {
      const queryWords = getSettingsSearchWords(searchInput.value);
      clearSearchButton.hidden = queryWords.length === 0;
      if (clearSearchSlot) {
        clearSearchSlot.hidden = clearSearchButton.hidden;
      }
    };

    this.layoutDisposables.add(addDisposableListener(searchInput, "input", () => {
      this.searchQuery = searchInput.value;
      updateSearchState();
      this.refreshContent();
    }));
    this.layoutDisposables.add(addDisposableListener(clearSearchButton, "click", () => {
      searchInput.value = "";
      this.searchQuery = "";
      updateSearchState();
      this.refreshContent();
      searchInput.focus();
    }));
    updateSearchState();

    aside.append(div("settings-view-nav-header", backButton), search, nav);
    return aside;
  }

  private updateNavSelection(): void {
    for (const button of Array.from(this.root.querySelectorAll<HTMLButtonElement>(".settings-view-nav-item"))) {
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

  private createContent(): HTMLElement {
    const content = div("settings-view-content");
    const queryWords = getSettingsSearchWords(this.searchQuery);
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

    const resultCount = this.filterSearchResults(container, queryWords);
    if (resultCount === 0) {
      container.appendChild(this.createEmptySearchResults());
    }
  }

  private filterSearchResults(container: HTMLElement, queryWords: readonly string[]): number {
    let resultCount = 0;
    for (const card of Array.from(container.querySelectorAll<HTMLElement>(".settings-card"))) {
      const isMatch = settingsSearchMatches(card.dataset.search ?? "", queryWords);
      card.hidden = !isMatch;
      if (isMatch) {
        resultCount++;
      }
    }

    for (const section of Array.from(container.querySelectorAll<HTMLElement>(".settings-section"))) {
      section.hidden = !Array.from(section.querySelectorAll<HTMLElement>(".settings-card"))
        .some(card => !card.hidden);
    }

    return resultCount;
  }

  private createEmptySearchResults(): HTMLElement {
    return div(
      "settings-search-empty",
      title(localize("settings.search.noResultsTitle", "No settings found")),
      text("p", "settings-description", localize("settings.search.noResultsDescription", "Try a different search term.")),
    );
  }

  private renderSettingsContent(container: HTMLElement, sectionIds: readonly SettingsSectionId[]): void {
    const descriptors = this.createContentDescriptors();
    for (const sectionId of sectionIds) {
      for (const descriptor of descriptors
        .filter(candidate => candidate.sectionId === sectionId)
        .sort((first, second) => first.order - second.order)) {
        container.appendChild(this.createContentDescriptorElement(descriptor));
      }
    }
  }

  private createContentDescriptors(): readonly SettingsContentDescriptor[] {
    return [
      {
        id: "general-preferences",
        create: () => this.createSettingsTreeDescriptorElement("general-preferences"),
        order: 0,
        sectionId: "general",
      },
      {
        id: "chart-defaults",
        create: () => this.createSettingsTreeDescriptorElement("chart-defaults"),
        order: 10,
        sectionId: "general",
      },
      {
        id: "template-preferences",
        create: () => this.createSettingsTreeDescriptorElement("template-preferences"),
        order: 0,
        sectionId: "template",
      },
      {
        id: "template-matching",
        create: () => this.createSettingsTreeDescriptorElement("template-matching"),
        order: 10,
        sectionId: "template",
      },
      {
        id: "template-library",
        create: () => this.createSettingsTreeDescriptorElement("template-library"),
        order: 20,
        sectionId: "template",
      },
      {
        id: "template-semantic-library",
        create: () => this.createSettingsTreeDescriptorElement("template-semantic-library"),
        order: 30,
        sectionId: "template",
      },
      {
        id: "appearance-preferences",
        create: () => this.createSettingsTreeDescriptorElement("appearance-preferences"),
        order: 0,
        sectionId: "appearance",
      },
      {
        id: "origin-integration",
        create: () => this.createSettingsTreeDescriptorElement("origin-integration"),
        order: 0,
        sectionId: "origin",
      },
      {
        id: "about",
        create: () => this.createSettingsTreeDescriptorElement("about"),
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

  private createSettingsTreeDescriptorElement(descriptorId: SettingsContentDescriptorId): HTMLElement {
    const tree = this.registerContentDisposable(new SettingsTree());
    tree.update(this.createDescriptorTreeSections(descriptorId));
    this.descriptorTrees.set(descriptorId, tree);
    return tree.element;
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
          this.createSettingsTreeControlItem({
            id: "settings-language-card",
            createControl: () => this.createSelect({
              id: "settings-language-dropdown",
              value: this.options.language,
              onChange: value => {
                if (value === "system" || value === "zh" || value === "en") {
                  void this.options.onLanguageChange(value);
                }
              },
              options: languageOptions,
            }),
            description: localize("settings.language.description", "Choose the display language used by the app."),
            searchText: normalizeSettingsSearchText(optionLabels(languageOptions)),
            title: localize("settings.language.title", "Language"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-close-behavior-card",
            createControl: () => this.createSelect({
              id: "settings-close-behavior-dropdown",
              value: this.options.windowCloseSettings.behavior,
              onChange: value => {
                if (value === "minimizeToTray" || value === "quit") {
                  void this.options.windowCloseSettings.onBehaviorChange(value);
                }
              },
              options: this.options.windowCloseBehaviorOptions,
              disabled: this.options.windowCloseSettings.isSaving,
            }),
            description: localize("settings.closeBehavior.description", "Choose what happens when the main window is closed."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.windowCloseBehaviorOptions)),
            title: localize("settings.closeBehavior.title", "Close Window"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-numeric-display-card",
            createControl: () => this.createSwitchWidget({
              ariaLabel: localize("settings.numericDisplay.title", "优化表格数值显示"),
              checked: this.options.numericDisplaySettings.optimized,
              id: "settings-numeric-display-toggle",
              onChange: checked => {
                void this.options.numericDisplaySettings.onOptimizedChange(checked);
              },
            }).domNode,
            description: localize("settings.numericDisplay.description", "优化科学计数法以合适小数位显示以更好的预览"),
            title: localize("settings.numericDisplay.title", "优化表格数值显示"),
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
          this.createSettingsTreeControlItem({
            id: "settings-table-template-visualization-card",
            createControl: () => this.createSwitchWidget({
              ariaLabel: localize("settings.tableTemplateVisualization.title", "Template Visualization"),
              checked: this.options.tableTemplateVisualizationSettings.enabled,
              id: "settings-table-template-visualization-toggle",
              onChange: checked => {
                void this.options.tableTemplateVisualizationSettings.onEnabledChange(checked);
              },
              disabled: this.options.tableTemplateVisualizationSettings.isSaving,
            }).domNode,
            description: localize("settings.tableTemplateVisualization.description", "Show the current template ranges on the table preview."),
            title: localize("settings.tableTemplateVisualization.title", "Template Visualization"),
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
            id: "settings-filename-matching-card",
            createElement: () => this.createFileNameMatching(this.options.fileNameMatchingSettings),
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
            id: "settings-template-domain-packs-card",
            createElement: () => this.createTemplateDomainPacks(this.options.templateSettings),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-template-x-axis-priority-card",
            createElement: () => this.createXAxisIntentPriority(this.options.templateSettings),
          }),
        ],
      },
    ];
  }

  private createTemplateSemanticLibrarySettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-template-semantic-library-section",
        items: [
          this.createSettingsTreeElementItem({
            id: "settings-template-semantic-library-card",
            createElement: () => this.createTemplateSemanticLibrary(this.options.templateSettings),
          }),
        ],
      },
    ];
  }

  private createTemplateDomainPacks(settings: TemplateSettings): HTMLElement {
    const container = card("settings-template-domain-packs-card", "settings-card-block");
    const titleText = localize("settings.template.domainPacks.title", "Domain Packs");
    const description = localize("settings.template.domainPacks.description", "Built-in domain packs scope title and marker evidence before Review builds binding candidates.");
    setSettingsSearchText(
      container,
      titleText,
      description,
      settings.builtinDomainPacks.map(formatDomainPackSearchText).join(" "),
    );
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
    pack: DataResourceBuiltinSemanticDomainPack,
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
    const container = card("settings-template-x-axis-priority-card", "settings-card-block");
    const titleText = localize("settings.template.xAxisPriority.title", "X Axis Intent Priority");
    const description = localize("settings.template.xAxisPriority.description", "Drag intent blocks to decide which X role wins when one table exposes several legal X sequences.");
    setSettingsSearchText(
      container,
      titleText,
      description,
      settings.xAxisIntentPriority.map(formatXAxisIntent).join(" "),
    );
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

  private createTemplateSemanticLibrary(settings: TemplateSettings): HTMLElement {
    const container = card("settings-template-semantic-library-card", "settings-card-block settings-template-semantic-library-card");
    const titleText = localize("settings.template.semantic.title", "Semantic Library");
    const description = localize("settings.template.semantic.description", "Built-in match terms can be disabled for Review, and custom terms join the DataResource matcher.");
    setSettingsSearchText(
      container,
      titleText,
      description,
      settings.builtinTerms.map(rule => `${rule.term} ${rule.canonicalRole} ${rule.axisTendency}`).join(" "),
      settings.customTerms.map(rule => `${rule.term} ${rule.canonicalRole} ${rule.axisTendency}`).join(" "),
    );
    container.appendChild(headingBlock(titleText, description));

    container.appendChild(this.createBuiltinSemanticTermList(settings));
    container.appendChild(this.createDisabledBuiltinSemanticTermList(settings));
    container.append(
      text("p", "settings-template-subtitle", localize("settings.template.semantic.customMappingTitle", "Custom term mapping")),
      this.createTemplateSemanticTermForm(settings),
    );
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createBuiltinSemanticTermList(settings: TemplateSettings): HTMLElement {
    const section = div("settings-template-library-group");
    const title = localize("settings.template.semantic.activeTitle", "Active match terms");
    section.appendChild(text("p", "settings-template-subtitle", title));
    section.appendChild(this.createTemplateSemanticTermField(
      settings,
      settings.activeTerms.map(term => term.source === "builtin"
        ? this.createBuiltinSemanticTermItem(settings, term, "enabled")
        : this.createCustomSemanticTermItem(settings, term)),
      title,
      true,
    ));
    return section;
  }

  private createDisabledBuiltinSemanticTermList(settings: TemplateSettings): HTMLElement {
    const disabledTermIds = new Set(settings.disabledBuiltinTermIds);
    const disabledTerms = settings.builtinTerms.filter(term => disabledTermIds.has(term.id));
    const section = div("settings-template-library-group");
    const title = localize("settings.template.semantic.recommendedBuiltinTitle", "Recommended built-in match terms");
    section.appendChild(text("p", "settings-template-subtitle", title));
    section.appendChild(this.createTemplateSemanticTermField(
      settings,
      disabledTerms.map(term => this.createBuiltinSemanticTermItem(settings, term, "disabled")),
      title,
      false,
      localize("settings.template.semantic.noDisabledBuiltin", "No recommended built-in match terms."),
    ));
    return section;
  }

  private createTemplateSemanticTermField(
    settings: TemplateSettings,
    items: readonly IInputBoxWidgetItem[],
    ariaLabel: string,
    inputVisible: boolean,
    emptyLabel?: string,
  ): HTMLElement {
    const inputBox = this.registerContentDisposable(new InputBoxWidget({
      ariaLabel,
      disabled: settings.isSaving,
      emptyLabel,
      inputVisible,
      items,
      placeholder: localize("settings.template.semantic.termInputPlaceholder", "Add match term"),
      value: this.options.templateSemanticTermDraft,
    }));
    inputBox.element.classList.add("settings-template-term-inputbox");
    if (inputVisible) {
      this.registerContentDisposable(inputBox.onDidChange(value => {
        this.options.setTemplateSemanticTermDraft(value);
      }));
      this.registerContentDisposable(inputBox.onDidAccept(() => {
        void settings.onAddSemanticTerm();
      }));
    }
    this.registerContentDisposable(inputBox.onDidTriggerItemAction(({ item }) => {
      if (item.kind === "builtin-enabled") {
        void settings.onDisableBuiltinTerm(item.id);
        return;
      }
      if (item.kind === "builtin-disabled") {
        void settings.onEnableBuiltinTerm(item.id);
        return;
      }
      if (item.kind === "custom") {
        void settings.onRemoveSemanticTerm(item.id);
      }
    }));
    return inputBox.element;
  }

  private createBuiltinSemanticTermItem(
    settings: TemplateSettings,
    semanticTerm: TemplateBuiltinSemanticTerm,
    state: "enabled" | "disabled",
  ): IInputBoxWidgetItem {
    const isEnabled = state === "enabled";
    return {
      id: semanticTerm.id,
      label: semanticTerm.term,
      kind: isEnabled ? "builtin-enabled" : "builtin-disabled",
      action: {
        ariaLabel: isEnabled
          ? localize("settings.template.semantic.disableBuiltin", "Disable built-in match term {term}", { term: semanticTerm.term })
          : localize("settings.template.semantic.enableBuiltin", "Enable built-in match term {term}", { term: semanticTerm.term }),
        icon: isEnabled ? LxIcon.close : LxIcon.add,
        title: isEnabled
          ? localize("settings.template.semantic.disableBuiltinTitle", "Disable this built-in match term for Review")
          : localize("settings.template.semantic.enableBuiltinTitle", "Enable this built-in match term for Review"),
      },
      disabled: settings.isSaving,
    };
  }

  private createCustomSemanticTermItem(settings: TemplateSettings, semanticTerm: TemplateSemanticTerm): IInputBoxWidgetItem {
    return {
      id: semanticTerm.id,
      label: semanticTerm.term,
      kind: "custom",
      title: formatSemanticTermRule(semanticTerm),
      action: {
        ariaLabel: localize("settings.template.semantic.removeTerm", "Remove match term {term}", { term: semanticTerm.term }),
        icon: LxIcon.close,
        title: localize("settings.template.semantic.remove", "Remove term"),
      },
      disabled: settings.isSaving,
    };
  }

  private createTemplateSemanticTermForm(settings: TemplateSettings): HTMLElement {
    const form = div("settings-template-semantic-form");
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings.template.semantic.roleLabel", "Role"), this.createSelect({
        id: "settings-template-semantic-role-select",
        value: this.options.templateSemanticRoleDraft,
        onChange: this.options.setTemplateSemanticRoleDraft,
        options: settings.roleOptions,
        disabled: settings.isSaving,
      })),
      field(localize("settings.template.semantic.axisLabel", "Axis"), this.createSelect({
        id: "settings-template-semantic-axis-select",
        value: this.options.templateSemanticAxisDraft,
        onChange: this.options.setTemplateSemanticAxisDraft,
        options: settings.axisOptions,
        disabled: settings.isSaving,
      })),
      field(localize("settings.template.semantic.policyLabel", "Match"), this.createSelect({
        id: "settings-template-semantic-policy-select",
        value: this.options.templateSemanticMatchPolicyDraft,
        onChange: this.options.setTemplateSemanticMatchPolicyDraft,
        options: settings.matchPolicyOptions,
        disabled: settings.isSaving,
      })),
      field(localize("settings.template.semantic.intentLabel", "Intent"), this.createSelect({
        id: "settings-template-semantic-intent-select",
        value: this.options.templateSemanticIntentDraft,
        onChange: this.options.setTemplateSemanticIntentDraft,
        options: settings.intentOptions,
        disabled: settings.isSaving,
      })),
      field(localize("settings.template.semantic.unitLabel", "Unit"), this.createSelect({
        id: "settings-template-semantic-unit-select",
        value: this.options.templateSemanticUnitDraft,
        onChange: this.options.setTemplateSemanticUnitDraft,
        options: settings.unitOptions,
        disabled: settings.isSaving,
      })),
      field(localize("settings.template.semantic.familyLabel", "Family"), this.createSelect({
        id: "settings-template-semantic-family-select",
        value: this.options.templateSemanticFamilyDraft,
        onChange: this.options.setTemplateSemanticFamilyDraft,
        options: settings.familyOptions,
        disabled: settings.isSaving,
      })),
      field(localize("settings.template.semantic.ivModeLabel", "IV mode"), this.createSelect({
        id: "settings-template-semantic-iv-mode-select",
        value: this.options.templateSemanticIvModeDraft,
        onChange: this.options.setTemplateSemanticIvModeDraft,
        options: settings.ivModeOptions,
        disabled: settings.isSaving,
      })),
    );
    form.append(
      grid,
      div("settings-actions-end", this.createButton({
        id: "settings-template-semantic-add-button",
        label: localize("settings.template.semantic.add", "Add Term"),
        onClick: () => void settings.onAddSemanticTerm(),
        disabled: settings.isSaving || !this.options.templateSemanticTermDraft.trim(),
        variant: "primary",
      })),
    );
    return form;
  }

  private createAppearanceSettingsTree(): readonly SettingsTreeSection[] {
    const { appearanceSettings } = this.options;
    return [
      {
        id: "settings-appearance-section",
        title: this.getSectionLabel("appearance"),
        items: [
          this.createSettingsTreeControlItem({
            id: "settings-theme-card",
            createControl: () => this.createSelect({
              id: "settings-theme-dropdown",
              value: this.options.theme,
              onChange: value => {
                if (value === "system" || value === "light" || value === "dark") {
                  void this.options.onThemeChange(value);
                }
              },
              options: this.options.themeModeOptions,
            }),
            description: localize("settings.theme.description", "Choose the workbench color theme."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.themeModeOptions)),
            title: localize("settings.theme.title", "Theme"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-explorer-density-card",
            createControl: () => this.createSelect({
              id: "settings-explorer-density-dropdown",
              value: appearanceSettings.explorerDensity,
              onChange: value => {
                if (value === "compact" || value === "default" || value === "comfortable") {
                  void this.options.appearanceSettings.onExplorerDensityChange(value);
                }
              },
              options: appearanceSettings.explorerDensityOptions,
              disabled: appearanceSettings.isExplorerDensitySaving,
            }),
            description: localize("settings.explorerDensity.description", "Choose how compact file rows appear in Explorer."),
            searchText: normalizeSettingsSearchText(optionLabels(appearanceSettings.explorerDensityOptions)),
            title: localize("settings.explorerDensity.title", "Explorer Density"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-explorer-badges-card",
            createControl: () => this.createSwitchWidget({
              ariaLabel: localize("settings.explorerBadges.title", "Explorer Badges"),
              checked: appearanceSettings.showExplorerBadges,
              id: "settings-explorer-badges-toggle",
              onChange: checked => {
                void this.options.appearanceSettings.onExplorerBadgeVisibilityChange(checked);
              },
            }).domNode,
            description: localize("settings.explorerBadges.description", "Show measurement badges beside files in Explorer."),
            title: localize("settings.explorerBadges.title", "Explorer Badges"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-explorer-badge-colors-card",
            createControl: () => this.createBadgeColorControls(appearanceSettings),
            description: localize("settings.explorerBadgeColors.description", "Choose Explorer badge colors by measurement label."),
            searchText: normalizeSettingsSearchText(
              optionLabels(appearanceSettings.explorerBadgeColorLabels),
              optionLabels(appearanceSettings.explorerBadgeColorOptions),
            ),
            title: localize("settings.explorerBadgeColors.title", "Badge Colors"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-layout-card",
            createControl: () => this.createLayoutResetControl(),
            description: localize("settings.layout.description", "Reset sidebar width and hidden workbench parts."),
            title: localize("settings.layout.title", "Layout"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-background-card",
            createControl: () => this.createBackgroundControls(appearanceSettings),
            description: localize("settings.background.description", "Choose the workbench page background color."),
            title: localize("settings.background.title", "Background"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-transparent-chrome-card",
            createControl: () => this.createSwitchWidget({
              ariaLabel: localize("settings.transparentChrome.title", "Translucent sidebar"),
              checked: appearanceSettings.transparentChrome,
              id: "settings-transparent-chrome-toggle",
              onChange: checked => {
                void this.options.appearanceSettings.onTransparentChromeChange(checked);
              },
            }).domNode,
            description: localize("settings.transparentChrome.description", "Let the sidebar blend with the desktop window surface."),
            title: localize("settings.transparentChrome.title", "Translucent sidebar"),
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

    return div(
      "settings-color-controls",
      colorInput,
      backgroundResetActionContainer,
      swatches,
    );
  }

  private createOriginSettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-origin-section",
        title: this.getSectionLabel("origin"),
        items: [
          this.createSettingsTreeElementItem({
            id: "settings-origin-path-card",
            createElement: () => this.createOriginPathCard(this.options.originSettings),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-origin-cleanup-card",
            createElement: () => this.createOriginCleanupCard(this.options.originSettings),
          }),
          this.createSettingsTreeElementItem({
            id: "settings-origin-plot-card",
            createElement: () => this.createOriginPlot(this.options.originSettings),
          }),
        ],
      },
    ];
  }

  private createOriginPathCard(originSettings: OriginSettingsSectionProps): HTMLElement {
    const originPathTitle = localize("settings.origin.title", "Origin Executable Path");
    const originPathDescription = localize("settings.origin.description", "Choose the Origin app used to open files.");
    const pathCard = card("settings-origin-path-card", "settings-card-block");
    setSettingsSearchText(
      pathCard,
      originPathTitle,
      originPathDescription,
      originSettings.currentPath,
      localize("settings.origin.choosePathButton", "Choose Origin.exe"),
      localize("settings.origin.checkButton", "Check Connection"),
      localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."),
    );
    pathCard.append(
      headingBlock(originPathTitle, originPathDescription),
      this.createPathControls(originSettings),
    );
    return pathCard;
  }

  private createOriginCleanupCard(originSettings: OriginSettingsSectionProps): HTMLElement {
    const cleanupTitle = localize("settings.origin.cleanup.title", "Runtime Cleanup");
    const cleanupDescription = localize("settings.origin.cleanup.description", "Manage automatic cleanup for Origin runtime cache.");
    const cleanupCard = card("settings-origin-cleanup-card", "settings-card-block");
    setSettingsSearchText(
      cleanupCard,
      cleanupTitle,
      cleanupDescription,
      localize("settings.origin.cleanup.enableLabel", "Auto cleanup"),
      optionLabels(this.options.cleanupEnabledOptions),
      localize("settings.origin.cleanup.keepSuccessLabel", "Keep successful jobs"),
      optionLabels(this.options.cleanupKeepSuccessOptions),
      localize("settings.origin.cleanup.failedDaysLabel", "Keep failed jobs (days)"),
      optionLabels(this.options.cleanupFailedDaysOptions),
      localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
    );
    cleanupCard.append(
      headingBlock(cleanupTitle, cleanupDescription),
      this.createOriginCleanupGrid(originSettings),
      div("settings-actions-end", this.createButton({
        id: "settings-origin-cleanup-run-btn",
        label: originSettings.cleanupRunning ? localize("settings.origin.cleanup.running", "Cleaning...") : localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
        onClick: () => void originSettings.onRunCleanupNow(),
        disabled: !originSettings.isCleanupAvailable || originSettings.cleanupRunning || originSettings.cleanupSaving,
        variant: "secondary",
      })),
    );
    return cleanupCard;
  }

  private createAboutSettingsTree(): readonly SettingsTreeSection[] {
    const { appUpdateSettings } = this.options;
    return [
      {
        id: "settings-about-section",
        title: this.getSectionLabel("about"),
        items: [
          this.createSettingsTreeControlItem({
            id: "settings-about-version-card",
            createControl: () => text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings.about.versionUnknown", "Unknown")),
            description: localize("settings.about.versionDescription", "The installed Conductor Studio version."),
            title: localize("settings.about.versionTitle", "Current Version"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-release-notes-card",
            createControl: () => this.createButton({
              id: "settings-release-notes-show-btn",
              label: localize("settings.releaseNotes.showButton", "Show Release Notes"),
              onClick: this.options.handleShowReleaseNotes,
              variant: "secondary",
            }),
            description: localize("settings.releaseNotes.description", "Review recent product changes and fixes."),
            searchText: localize("settings.releaseNotes.showButton", "Show Release Notes"),
            title: localize("settings.releaseNotes.title", "Release Notes"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-user-guide-card",
            createControl: () => this.createButton({
              id: "settings-user-guide-show-btn",
              label: localize("settings.userGuide.showButton", "Show User Guide"),
              onClick: () => this.showUserGuideDialog(),
              variant: "secondary",
            }),
            description: localize("settings.userGuide.description", "Open the bundled guide for common workflows."),
            searchText: localize("settings.userGuide.showButton", "Show User Guide"),
            title: localize("settings.userGuide.title", "User Guide"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-app-update-card",
            createControl: () => this.createButton({
              id: "settings-app-update-check-btn",
              label: this.options.appUpdateChecking ? localize("settings.appUpdate.checking", "Checking...") : localize("settings.appUpdate.checkButton", "Check for Updates"),
              onClick: this.options.handleCheckForUpdates,
              disabled: !appUpdateSettings.isAvailable || this.options.appUpdateChecking,
              variant: "secondary",
            }),
            description: localize("settings.appUpdate.description", "Check whether a newer version is available."),
            searchText: localize("settings.appUpdate.checkButton", "Check for Updates"),
            title: localize("settings.appUpdate.title", "App Updates"),
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
          this.createSettingsTreeControlItem({
            id: "settings-default-transfer-y-scale-card",
            createControl: () => this.createSelect({
              id: "settings-default-transfer-y-scale-select",
              value: settings.defaultYScaleForTransfer,
              onChange: value => void settings.onDefaultYScaleForTransferChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            description: localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.yScaleOptions)),
            title: localize("settings.chartScaleDefaults.transferCurve", "Transfer"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-default-output-y-scale-card",
            createControl: () => this.createSelect({
              id: "settings-default-output-y-scale-select",
              value: settings.defaultYScaleForOutput,
              onChange: value => void settings.onDefaultYScaleForOutputChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.outputCurve", "Output"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-default-cv-y-scale-card",
            createControl: () => this.createSelect({
              id: "settings-default-cv-y-scale-select",
              value: settings.defaultYScaleForCv,
              onChange: value => void settings.onDefaultYScaleForCvChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.cvCurve", "C-V"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-default-cf-y-scale-card",
            createControl: () => this.createSelect({
              id: "settings-default-cf-y-scale-select",
              value: settings.defaultYScaleForCf,
              onChange: value => void settings.onDefaultYScaleForCfChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.cfCurve", "C-f"),
          }),
          this.createSettingsTreeControlItem({
            id: "settings-default-pv-y-scale-card",
            createControl: () => this.createSelect({
              id: "settings-default-pv-y-scale-select",
              value: settings.defaultYScaleForPv,
              onChange: value => void settings.onDefaultYScaleForPvChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.pvCurve", "P-V"),
          }),
          ...(settings.feedback.message ? [
            this.createSettingsTreeElementItem({
              id: "settings-chart-scale-feedback-card",
              createElement: () => this.createChartScaleFeedback(settings.feedback),
            }),
          ] : []),
          this.createSettingsTreeElementItem({
            id: "settings-chart-defaults-card",
            createElement: () => this.createChartDefaults(settings),
          }),
        ],
      },
    ];
  }

  private createChartScaleFeedback(feedback: Feedback): HTMLElement {
    const feedbackCard = card("settings-chart-scale-feedback-card", "settings-card-block");
    appendFeedback(feedbackCard, feedback);
    return feedbackCard;
  }

  private createChartDefaults(settings: ChartDefaultSettings): HTMLElement {
    const container = card("settings-chart-defaults-card", "settings-card-block");
    const titleText = localize("settings.chartTypographyDefaults.title", "Chart Typography Defaults");
    const description = localize("settings.chartTypographyDefaults.description", "Choose default chart title and tick label sizes.");
    setSettingsSearchText(
      container,
      titleText,
      description,
      localize("settings.chartTypographyDefaults.titleSize", "Title"),
      localize("settings.chartTypographyDefaults.tickLabel", "Tick label"),
    );
    container.appendChild(headingBlock(
      titleText,
      description,
    ));
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings.chartTypographyDefaults.titleSize", "Title"), this.createInput({
        id: "settings-default-title-font-size-input",
        value: this.options.axisTitleFontSizeDraft,
        onChange: this.options.setAxisTitleFontSizeDraft,
        onBlur: () => {
          if (this.options.axisTitleFontSizeDraft !== String(settings.axisTitleFontSize ?? "")) {
            void settings.onAxisTitleFontSizeChange(this.options.axisTitleFontSizeDraft.trim());
          }
        },
        placeholder: "22",
        disabled: settings.isSaving,
      })),
      field(localize("settings.chartTypographyDefaults.tickLabel", "Tick label"), this.createInput({
        id: "settings-default-tick-label-font-size-input",
        value: this.options.tickLabelFontSizeDraft,
        onChange: this.options.setTickLabelFontSizeDraft,
        onBlur: () => {
          if (this.options.tickLabelFontSizeDraft !== String(settings.tickLabelFontSize ?? "")) {
            void settings.onTickLabelFontSizeChange(this.options.tickLabelFontSizeDraft.trim());
          }
        },
        placeholder: "18",
        disabled: settings.isSaving,
      })),
    );
    container.appendChild(grid);
    return container;
  }

  private createFileNameMatching(settings: FileNameMatchingSettings): HTMLElement {
    const container = card("settings-filename-matching-card", "settings-card-block");
    const titleText = localize("settings.filenameMatching.title", "Filename Field Matching");
    const description = localize("settings.filenameMatching.description", "Choose which separator characters split filename fields for template rules.");
    const separatorsLabel = localize("settings.filenameMatching.label", "Field separators");
    const hint = localize("settings.filenameMatching.hint", "Each character acts as a separator. The default is {value}.", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS });
    setSettingsSearchText(container, titleText, description, separatorsLabel, hint);
    container.appendChild(headingBlock(titleText, description));
    const body = div("settings-field");
    body.append(
      label(separatorsLabel),
      this.createInput({
        id: "settings-filename-separators-input",
        value: this.options.fileNameFieldSeparatorsDraft,
        onChange: this.options.setFileNameFieldSeparatorsDraft,
        onBlur: () => {
          if (this.options.fileNameFieldSeparatorsDraft !== settings.fieldSeparators) {
            void settings.onFieldSeparatorsChange(this.options.fileNameFieldSeparatorsDraft);
          }
        },
        disabled: settings.isSaving,
        monospace: true,
      }),
      text("p", "settings-hint", hint),
    );
    container.appendChild(body);
    appendFeedback(container, settings.feedback);
    return container;
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
    controls.append(
      div("settings-path-input", pathInputBox.element),
      this.createButton({
        id: "settings-origin-path-choose-btn",
        label: localize("settings.origin.choosePathButton", "Choose Origin.exe"),
        onClick: () => void settings.onChoosePath(),
        disabled: !settings.isConfigurable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
        variant: "primary",
      }),
      this.createButton({
        id: "settings-origin-health-check-btn",
        label: settings.isHealthChecking ? localize("settings.origin.checking", "Checking...") : localize("settings.origin.checkButton", "Check Connection"),
        onClick: () => void settings.onCheckHealth(),
        disabled: !settings.isHealthCheckAvailable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
        variant: "secondary",
      }),
    );
    return controls;
  }

  private createOriginCleanupGrid(settings: OriginSettingsSectionProps): HTMLElement {
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings.origin.cleanup.enableLabel", "Auto cleanup"), this.createSelect({
        id: "settings-origin-cleanup-enabled-select",
        value: String(Boolean(settings.cleanupEnabled)),
        onChange: value => void settings.onCleanupEnabledChange(value === "true"),
        options: this.options.cleanupEnabledOptions,
        disabled: settings.cleanupSaving,
      })),
      field(localize("settings.origin.cleanup.keepSuccessLabel", "Keep successful jobs"), this.createSelect({
        id: "settings-origin-cleanup-keep-success-select",
        value: String(settings.cleanupKeepSuccessJobs ?? 0),
        onChange: value => void settings.onCleanupKeepSuccessJobsChange(value),
        options: this.options.cleanupKeepSuccessOptions,
        disabled: settings.cleanupSaving,
      })),
      field(localize("settings.origin.cleanup.failedDaysLabel", "Keep failed jobs (days)"), this.createSelect({
        id: "settings-origin-cleanup-failed-days-select",
        value: String(settings.cleanupFailedRetentionDays ?? 7),
        onChange: value => void settings.onCleanupFailedRetentionDaysChange(value),
        options: this.options.cleanupFailedDaysOptions,
        disabled: settings.cleanupSaving,
      })),
    );
    return grid;
  }

  private createOriginPlot(settings: OriginSettingsSectionProps): HTMLElement {
    const container = card("settings-origin-plot-card", "settings-card-block");
    const titleText = localize("settings.origin.plot.title", "Default Plot Settings");
    const description = localize("settings.origin.plot.description", "Used by \"Open in Origin\".");
    setSettingsSearchText(
      container,
      titleText,
      description,
      localize("settings.origin.plot.xyPairsLabel", "XY pairs"),
      localize("settings.origin.plot.xyPairsHint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4))."),
      localize("settings.origin.plot.commandLabel", "Plot command override"),
      localize("settings.origin.plot.commandHint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs."),
      localize("chart.legend.fontSize", "Legend size"),
      localize("settings.origin.plot.postCommandsLabel", "Post-plot commands"),
      localize("settings.origin.plot.postCommandsHint", "One LabTalk command per line, executed after plotting."),
    );
    container.appendChild(headingBlock(titleText, description));
    container.append(
      field(localize("settings.origin.plot.xyPairsLabel", "XY pairs"), this.createInput({
        id: "settings-origin-plot-xy-pairs-input",
        value: this.options.xyPairsDraft,
        onChange: this.options.setXyPairsDraft,
        onBlur: () => {
          const nextValue = this.options.xyPairsDraft.trim();
          if (nextValue !== (settings.plotXyPairs ?? "")) {
            void settings.onPlotXyPairsChange(nextValue);
          }
        },
        disabled: settings.plotSaving || !settings.isConfigurable,
      }), localize("settings.origin.plot.xyPairsHint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4)).")),
      field(localize("settings.origin.plot.commandLabel", "Plot command override"), this.createInput({
        id: "settings-origin-plot-command-input",
        value: this.options.plotCommandDraft,
        onChange: this.options.setPlotCommandDraft,
        onBlur: () => {
          const nextValue = this.options.plotCommandDraft.trim();
          if (nextValue !== (settings.plotCommand ?? "")) {
            void settings.onPlotCommandChange(nextValue);
          }
        },
        disabled: settings.plotSaving || !settings.isConfigurable,
      }), localize("settings.origin.plot.commandHint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs.")),
      field(localize("chart.legend.fontSize", "Legend size"), this.createInput({
        id: "settings-origin-legend-font-size-input",
        value: this.options.originLegendFontSizeDraft,
        onChange: this.options.setOriginLegendFontSizeDraft,
        onBlur: () => {
          if (this.options.originLegendFontSizeDraft !== String(settings.plotLegendFontSize ?? "")) {
            void settings.onPlotLegendFontSizeChange(this.options.originLegendFontSizeDraft.trim());
          }
        },
        placeholder: localize("chart.axis.auto", "auto"),
        disabled: settings.plotSaving || !settings.isConfigurable,
      })),
      this.createPostCommandsField(settings),
    );
    appendFeedback(container, settings.plotFeedback);
    return container;
  }

  private createPostCommandsField(settings: OriginSettingsSectionProps): HTMLElement {
    const container = div("settings-field");
    const textarea = document.createElement("textarea");
    textarea.id = "settings-origin-plot-post-commands-input";
    textarea.className = "settings-textarea";
    textarea.value = this.options.postCommandsDraft;
    textarea.disabled = settings.plotSaving || !settings.isConfigurable;
    textarea.addEventListener("input", () => this.options.setPostCommandsDraft(textarea.value));
    textarea.addEventListener("blur", () => {
      const nextValue = this.options.postCommandsDraft.trim();
      const currentValue = String(settings.plotPostCommandsText ?? "").trim();
      if (nextValue !== currentValue) {
        void settings.onPlotPostCommandsChange(nextValue);
      }
    });
    container.append(
      label(localize("settings.origin.plot.postCommandsLabel", "Post-plot commands")),
      textarea,
      text("p", "settings-hint", localize("settings.origin.plot.postCommandsHint", "One LabTalk command per line, executed after plotting.")),
    );
    return container;
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

  private createSelect(options: FieldOptions, disposables?: DisposableStore): HTMLButtonElement {
    return this.createSelectWidget(options, disposables).domNode;
  }

  private createInput(options: TextInputOptions): HTMLElement {
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
    if (!options.monospace) {
      return inputBox.element;
    }
    return div("settings-input settings-input--mono", inputBox.element);
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
    buttons.clear();

    const swatchesContainer = container.querySelector<HTMLElement>(".settings-badge-color-options");
    const preview = container.querySelector<HTMLElement>(".settings-badge-preview");
    if (!swatchesContainer || !preview) {
      return;
    }

    reset(swatchesContainer);

    const activeBadge = settings.explorerBadgeColorLabels.find(l => l.value === this.activeBadgeLabelValue) || settings.explorerBadgeColorLabels[0];
    const selectedColor = settings.explorerBadgeColors[this.activeBadgeLabelValue] ?? "neutral";

    preview.textContent = activeBadge ? activeBadge.label : this.activeBadgeLabelValue;
    preview.dataset.color = selectedColor;

    for (const option of settings.explorerBadgeColorOptions) {
      const button = document.createElement("button");
      button.type = "button";
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
      button.addEventListener("click", () => {
        void this.options.appearanceSettings.onExplorerBadgeColorChange(this.activeBadgeLabelValue, option.value);
      });
      buttons.set(badgeColorButtonKey(this.activeBadgeLabelValue, option.value), button);
      swatchesContainer.appendChild(button);
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
      const button = buttons.get(badgeColorButtonKey(this.activeBadgeLabelValue, option.value));
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
    swatchButtons.clear();
    reset(container);

    for (const color of settings.backgroundColorOptions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-color-swatch";
      button.style.setProperty("--settings-swatch-color", color);
      button.setAttribute("aria-label", color);
      button.title = color;
      button.addEventListener("click", () => {
        void this.options.appearanceSettings.onBackgroundColorChange(color);
      });
      swatchButtons.set(color, button);
      container.append(button);
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

}

function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  append(element, ...children);
  return element;
}

function card(id: string, className: string): HTMLDivElement {
  const element = div(className ? `settings-card ${className}` : "settings-card");
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

function formatSemanticTermRule(rule: TemplateSemanticTerm): string {
  return [
    rule.canonicalRole,
    rule.axisTendency,
    rule.matchPolicy,
    rule.intent,
    rule.canonicalUnit,
    rule.family,
    rule.ivMode,
  ].filter(Boolean).join(" / ");
}

function formatDomainPackKind(kind: DataResourceBuiltinSemanticDomainPack["kind"]): string {
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

function formatDomainPackSearchText(pack: DataResourceBuiltinSemanticDomainPack): string {
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

function appendFeedback(container: HTMLElement, feedback: { type: "idle" | "success" | "error"; message: string } | undefined): void {
  if (!feedback?.message) {
    return;
  }

  container.appendChild(text("p", feedback.type === "error" ? "settings-feedback settings-feedback--error" : "settings-feedback settings-feedback--success", feedback.message));
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

function badgeColorButtonKey(badge: string, color: string): string {
  return `${badge}\u001f${color}`;
}
