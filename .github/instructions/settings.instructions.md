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
  -> SettingsView builds SettingsTreeSection records
  -> SettingsTree.update(sections)
  -> section id reuses the section widget
  -> item id reuses the setting row
  -> fixed title/description/control slots are patched
  -> SettingsView-owned controls emit typed intent callbacks
  -> changed control nodes replace only the item control slot
```

`SettingsTree` owns the fixed DOM slots for setting rows:

- title and optional description on the left;
- a control container slot on the right.

Controls are interchangeable slot content. `SettingsTree` receives an
`HTMLElement` for the right-side control slot and does not inspect whether it is
a select, switch, color swatch, reset button, path picker, action bar, toolbar,
or grouped action container. `SettingsView` owns each control's layout,
interaction callbacks, and disposable lifecycle.

Sections are rendering groups, not state owners. User edits flow from the
control's typed intent callback to `SettingsController`, then to
`ISettingsService` or an owner command. After the owner publishes a changed
snapshot, `SettingsView.update` rebuilds section records and `SettingsTree`
patches by stable ids.

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
| `contrib/settings/browser/settingsTree.ts` | stable keyed settings item widgets; owns fixed label/control DOM slots for caller-owned controls. |
| `contrib/settings/browser/settingsView.ts` | pure DOM rendering; callbacks only. |
| `contrib/settings/browser/settingsViewPane.ts` | DI shell, controller lifecycle, settings view-input subscription. |
| `contrib/settings/browser/settings.contribution.ts` | view/contribution registration. |

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
