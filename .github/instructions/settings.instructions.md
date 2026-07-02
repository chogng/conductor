---
description: Settings architecture - settings persistence, settings form ownership, command dispatch from settings UI, and settings-driven side effects.
applyTo: 'src/cs/workbench/services/settings/**,src/cs/workbench/contrib/settings/**'
---
# Settings

Settings is a preferences surface, not the owner of every behavior affected by
a preference.

The settings area owns the in-memory Conductor settings snapshot, settings view
input, and form editing state. User preference persistence goes through
platform `IConfigurationService`. Remembered app state belongs to
`IStorageService`.

## Flow

```txt
SettingsView control
  -> SettingsController
  -> pure preference: ISettingsService.updateSettings
  -> semantic operation: ICommandService owner command
  -> IConfigurationService user settings
  -> onDidChangeConductorSettings
  -> feature owners reread settings and apply their own state
```

Settings events are facts. Do not use them as hidden commands.

## Settings Tree Rendering

Follow the upstream Settings editor shape at a Conductor scale:

```txt
SettingsViewOptions
  -> SettingsLayout creates SettingsSectionDefinition records
  -> SettingsControllerService shares one SettingsController across the settings sidebar nav and main content panes
  -> SettingsNavigationView renders sidebar section/search navigation from the shared controller state
  -> SettingsController classifies updates into affected descriptor/item ids
  -> SettingsView creates SettingsContentDescriptor placement records
  -> active section renders matching descriptors / search renders all descriptors
  -> SettingsView creates one SettingsTreeModel root with a content header title
  -> descriptors add element/composite item elements to SettingsTreeModel sections by stable section id
  -> SettingsTreeModel.toSections() produces SettingsTreeSection records
  -> SettingsTree.update(model.toSections())
  -> SettingsTree uses the settings tree renderer to create structural templates
  -> SettingsTree renders a keyed section list
  -> each SettingsTreeSection renders an optional section header followed by one white section body with an internal list
  -> each list item renders an explicit divider node followed by the item body
  -> SettingsTree reuses section and list item DOM by stable section/item id
  -> SettingsTree.updateItems updates keyed list items and patches already-rendered item widgets without replacing sibling list items
  -> element items patch caller-owned cell roots
  -> grouped sibling items model independently updateable cells inside one section list
  -> composite items keep one caller-owned cell root only when child items share the same list item lifecycle
  -> SettingsView-owned controls and composite child content can register a local patch for component-internal updates
  -> SettingsView-owned controls emit typed intent callbacks
  -> changed settings update only the targeted SettingsTree item
```

`SettingsTreeModel` is a SettingsView-owned model for one settings content
surface: a root element with a content-level header title, ordered section
elements, and item elements with stable parentage. Descriptors contribute
items through `SettingsTreeModel.addItemToSection(...)`. The model must not
mutate DOM or bypass `SettingsTree`; it only owns tree identity, order, and
parent-child shape before producing `SettingsTreeSection` records.

`SettingsTree` owns keyed section/list-item order, lifecycle, stable ids,
roles, search visibility, and mounting. The settings tree renderer owns
section-list, section, optional section-header, section-body, list, list-item,
list-item divider, list-item body, and composite templates plus their product CSS classes. `SettingsTree` must not hardcode
settings product class names; renderer templates and `SettingsView`-owned cells
own that styling boundary. The tree owns two item shapes plus explicit grouping
metadata when several independently updateable list items belong to one logical
section group:

- `SettingsTreeElementItem` for caller-owned cell content that still belongs to
  the section item order.
- `SettingsTreeCompositeItem` for one settings list item whose child content
  items have their own stable ids, stable child DOM, and disposable lifecycles.

`SettingsView` creates ordinary setting cell DOM, including labels, layout,
controls, interaction callbacks, local patch registrations, and disposable
lifecycle. `SettingsTree` receives caller-owned element roots and owns only the
section ordering, renderer-created section/header/body/list-item lifecycles,
divider/body lifecycles, grouping metadata, item id, and optional item search
metadata.

When a settings section item has a display/edit interaction, model that state
through the shared section-item edit option in `SettingsView`. The base section
item owns the display-state cursor, role, focus, click, and keyboard activation;
the feature owner still owns whether the item is in display or edit state and
receives a typed edit intent callback. Do not hand-roll per-feature clickable
wrappers around settings list items.

Prefer modeling independently updateable regions as sibling `SettingsTree`
entries with stable ids inside one section. This keeps the tree model update target aligned with the DOM unit being
patched. The visual grouping must be explicit in `SettingsTree` item metadata
or cell class computation, not an unrelated wrapper or selector that hides a
model mismatch. Use `SettingsTreeCompositeItem` only when the children truly
share one cell-level lifecycle and should be patched through stable child item
nodes owned by the composite renderer.

Each rendered settings content area owns one `SettingsTree` root. Descriptors
contribute `SettingsTreeSection` records to that tree; they do not create
separate tree roots. All settings content must enter the page through
`SettingsTreeSection` and `SettingsTreeItem`; `SettingsView` must not patch
standalone section or list DOM outside `SettingsTree`.

Sections are rendering groups, not state owners. Each section has an optional
header followed by one white section body with an internal list. Settings content placement is
declared by descriptor `sectionId` and `order`; moving a settings item or section
between pages changes that placement declaration and removes the old placement.
User edits flow from the control's typed intent callback to
`SettingsController`, then to `ISettingsService` or an owner command.
`SettingsController` sends affected descriptor id(s) for structural changes or
affected item id(s) for ordinary settings changes with the next view options.
After the owner publishes a changed snapshot, `SettingsView.update` applies
registered local component patches owned by `SettingsView` and updates the
containing item's search metadata in place. These local patch callbacks must
not be stored on `SettingsTreeItem` records. If one update target mixes local
and non-local item ids, `SettingsView` applies the local patches first and sends
only the remaining item ids through `SettingsTree` widget patching by stable
ids. `SettingsTree.updateItems` must keep stable item keys, sibling cells, and
settings sections alive. A targeted grouped item id patches only that cell. A
targeted composite child id patches only that child item; it must not replace
the parent composite list item or sibling child items.

## Settings Search

Settings search is local `SettingsController` view state shared by the settings
sidebar navigation surface and main content surface. It does not go through
`ISearchService`, commands, configuration, or `ISettingsService`.

```txt
SettingsNavigationView search input
  -> SettingsController searchQuery draft
  -> SettingsView renders all settings sections
  -> setting list items filter by item-level search text
  -> matching controls keep their normal SettingsController callbacks
```

The content header identifies the current settings content page. Section
headers identify rendering groups inside that page. Neither header is a settings
item or search target. Cross-page settings search filters and reveals concrete
settings list items by item-level search metadata; page and section labels may
be displayed as context, but they must not cause sibling items to match.

`SettingsTreeItem.searchText` is rendering metadata for a settings list item. It may
include option labels, field labels, or semantic match terms that help the view
filter settings list items, but it must not encode control behavior or
persistence details.

## Template Semantic Library UI

The Template settings semantic-library section shows **domain rules**. A domain
rule is a user-facing domain scope, such as `iv`, plus X and Y character blocks
that DataResource can turn into axis evidence before Review builds binding
candidates.

The semantic-library surface is one `SettingsTreeSection` with a visible header:
the title and description stay on the left, and header actions on the right live
inside the section header actionbar container. Header actions belong to
`SettingsTreeSection.headerActions`; do not model them as standalone settings
list items or hand-written header buttons.

Each domain rule is a real settings list item with always-visible
`InputBoxWidget` controls. New rules are prepended as draft items and must not
replace existing draft or saved sibling items. The item leading area owns the
domain-scope title widget; the item trailing area owns two vertical widgets for
X and Y character-block tokens plus row actions. The title widget commits on
blur or Enter. The X and Y widgets commit their own token changes on Enter,
blur with pending text, or token removal. The X widget dedupes only its own
tokens by normalized key, and the Y widget does the same for Y tokens; terms may
appear in multiple domain rules. A rule is persisted only when the draft has a
valid domain title plus at least one X and one Y character block. Each persisted
save writes one `templateSemanticDomainRules` record with a stable rule id.

Domain priority is a separate Template Library settings item backed by
`templateSemanticDomainPriority`. It renders draggable domain blocks. When
DataResource sees several complete domain matches in one data file, it chooses
the highest-priority complete domain and uses that domain's X/Y evidence for
slicing; incomplete higher-priority domains are skipped.

`SettingsView` chooses each list item's leading/trailing orientation explicitly
as horizontal or vertical when it creates the item cell. Each visible list entry
has a stable item id and can be targeted by `SettingsController` without
rerendering unrelated entries in the section.
Semantic-library save or validation feedback belongs in notification/toast
presentation, not as a `SettingsTree` item in the section.

Each domain rule or priority block is a Settings UI value, not a separate state
owner. Typing in draft item inputs updates the controller-owned semantic section
item draft, and user gestures still flow through `SettingsController` callbacks
and then to `ISettingsService`.

## Configuration vs Storage

Use configuration for user preferences: schema/defaults, Settings UI,
`User/settings.json`, future sync/workspace/language override behavior, and
passive defaults consumed by feature owners.

Examples: theme, language, background color, transparent chrome, window close
behavior, Origin path/defaults, export defaults, plot/chart defaults, file-name
separator defaults, default scale preferences.

Use storage for remembered application state: prompts, onboarding, view widths,
collapsed state, recent resources, cache versions, migration markers, one-shot
tray hints.

Electron main may read user configuration for bootstrap/native needs, but must
not introduce a parallel settings store.

## Core Files

| File | Responsibility |
| --- | --- |
| `services/settings/common/settings.ts` | settings contracts, persisted types, view input, `ISettingsService`. |
| `services/settings/common/fileNameMatching.ts` | filename-matching preference defaults, normalization, and pure matching helpers used by Settings UI and settings consumers. |
| `services/settings/browser/settingsService.ts` | settings snapshot owner, load/update/merge, view input, events. |
| `platform/configuration/common/*` | upstream-shaped configuration registry/models/service and schema/defaults. |
| `workbench/services/configuration/**` | workbench configuration helpers/registration/runtime integration. |
| `platform/storage/**` | remembered app state, not user preferences. |
| `platform/theme/electron-main/*` | native theme/window appearance derived from configuration. |
| `platform/windows/electron-main/trayMainService*` | tray/close-to-tray policy and storage-backed hints. |
| `platform/origin/electron-main/*` | Origin configuration owner and IPC workflow split. |
| `platform/languagePacks/**`, `workbench/services/localization/**`, `contrib/localization/**` | display-language services and command/action wiring. |
| `contrib/settings/browser/settingsController.ts` | form drafts, validation, saving state, dispatch to settings service or owner commands. |
| `contrib/settings/browser/settingsLayout.ts` | settings section ids, navigation grouping, and section icon metadata. |
| `contrib/settings/browser/settingsSearch.ts` | settings search text normalization, query tokenization, and section/list item matching helpers. |
| `contrib/settings/browser/settingsTreeModels.ts` | settings tree model elements for content root, sections, item parentage, and conversion to render sections. |
| `contrib/settings/browser/settingsTree.ts` | stable keyed settings item widgets; owns section ordering, grouping, and element/composite mounting. |
| `contrib/settings/browser/settingsTreeRenderer.ts` | settings tree structural DOM templates and product CSS classes for section/list/list-item/composite wrappers. |
| `contrib/settings/browser/settingsView.ts` | pure DOM rendering; callbacks only. |
| `contrib/settings/browser/settings.contribution.ts` | view/contribution registration and thin ViewPane shells that attach the shared settings controller to registered view bodies. |

## Direct Update vs Command

Use `ISettingsService.updateSettings(...)` when the intent is only "persist
this preference" and the controller can normalize the value locally.

Use an owner command when the control represents a semantic operation owned by
another capability, even if it also persists a setting:

- theme/background/transparent chrome -> theme commands;
- layout reset/sidebar/workbench layout -> layout commands;
- language/update checks -> localization/update commands;
- export/origin/table/chart/search/plot actions -> owning feature command/service.

Do not add one command per raw setting field and do not add a generic
`settings.update(key, value)` command.

## Side Effects

`ISettingsService` publishes changed settings; it does not directly mutate
theme, layout, chart, plot, template, Session, or Explorer state. Feature
owners subscribe, reread settings, and apply their own state.

`IAppearanceService` may normalize appearance settings into a shared snapshot.
Appearance consumers reread that service and apply their own DOM/model state.

Do not add callbacks to `SettingsServiceOptions` for applying settings to other
services. It may carry static view-input context only.

## View Input

`SettingsViewInput` and `OriginSettingsViewInput` are service-local snapshots.
Change events stay `Event<void>`; listeners reread through getters.

`SettingsController` callbacks are form entry points only: normalize UI values,
manage draft/saving state, then call `ISettingsService` or an owner command.

## Adding A Setting

1. Identify the behavior owner.
2. Decide preference update vs owner-owned semantic operation.
3. Add field to `ConductorSettings` and configuration defaults/normalization when persisted.
4. Put normalization near the owner or in an owned common helper.
5. Add view input/rendering only if settings UI needs it.
6. Test persistence, command dispatch, or subscriber side effects at the owner boundary.

## Do Not

- Do not persist user preferences in storage.
- Do not store app-state markers in configuration.
- Do not let Settings service mutate unrelated feature state.
- Do not pass mutable settings objects or service behavior through view input.
- Do not read/write raw settings files from feature code.
