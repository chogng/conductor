---
description: Desktop window appearance - macOS translucent chrome, opaque surfaces, native theme source, renderer backgrounds, and Windows Mica guardrails.
applyTo: 'src/cs/code/electron-main/app.ts,src/cs/platform/window/**,src/cs/platform/theme/**,src/cs/base/parts/sandbox/electron-browser/preload.ts,src/cs/workbench/services/themes/**,src/cs/workbench/browser/media/**,src/cs/workbench/browser/parts/sidebar/**,src/cs/workbench/browser/parts/titlebar/**,src/cs/workbench/contrib/themes/**'
---
# Desktop Appearance

Desktop appearance is a two-layer system:

```txt
native window material / opaque fallback
  -> renderer DOM/CSS root, workbench, titlebar, sidebar backgrounds
  -> observed surface color
```

If either layer is wrong, the sidebar/titlebar can look wrong even when CSS
opacity appears correct.

## Native Layer

Native owns Electron/macOS window material and platform options:
`platform/theme/electron-main`, `platform/window/electron-main`, and the
Electron main app path. Workbench CSS must not own native material behavior.

For macOS translucent chrome:

- prefer titled window with `titleBarStyle: "hiddenInset"`;
- use clear background such as `#00000000`;
- use native vibrancy for active translucent state;
- do not rely on `transparent: true` as the visual effect;
- do not use macOS `titleBarOverlay` to mimic Windows unless explicitly needed.

Sync `nativeTheme.themeSource` from app theme before deriving material or
opaque surface colors:

```txt
light -> nativeTheme.themeSource = "light"
dark  -> nativeTheme.themeSource = "dark"
auto  -> nativeTheme.themeSource = "system"
```

Focused translucent state and unfocused/opaque surface state must stay in sync
between main and renderer. Main should send explicit opaque-surface payloads;
CSS should not infer focus or vibrancy state.

Main-process theme settings flow through `IThemeMainService` consuming
`IConfigurationService`. Do not add ad hoc settings readers in `app.ts`.

## Renderer Layer

Renderer owns DOM classes, CSS variables, and component backgrounds.

| Surface | Owner |
| --- | --- |
| root/body/#root transparent or opaque shell state | theme service + `style.css` |
| `.workbench_window` shell/tint | `workbench/browser/media/window.css` |
| title bar surface | `parts/titlebar/media/titlebar.css` |
| sidebar surface | `parts/sidebar/media/sidebarpart.css` |

For transparent chrome, root and `#root` stay transparent. Use one tint
strategy at a time; current Conductor shell tint is on `.workbench_window`,
with titlebar/sidebar transparent over it.

Do not depend only on global CSS for component surfaces; import order and
specificity can reintroduce opaque backgrounds.

Expected class flow:

```txt
transparent chrome enabled -> html.workbench-transparent-chrome
macOS renderer bridge available -> html.workbench-transparent-chrome-macos
native opaque surface active -> html.workbench-opaque-surface
```

## Windows Guardrails

- Preserve Windows Mica unless the task explicitly changes Windows appearance.
- Keep Windows tests when touching shared helpers.
- Do not toggle `setBackgroundMaterial` for macOS parity.
- Do not let macOS `vibrancy`, `titleBarStyle`, or opaque-surface changes alter Windows overlay/Mica paths.

## Debugging

Check native:

- platform and `BrowserWindow.isFocused()`;
- `backgroundColor`, `vibrancy`, `transparent`, `titleBarStyle`, overlay;
- `nativeTheme.themeSource` and `shouldUseDarkColors`;
- focused translucent vs unfocused opaque state.

Check renderer:

```js
document.documentElement.className;
getComputedStyle(document.body).backgroundColor;
getComputedStyle(document.querySelector(".workbench_window")).backgroundColor;
getComputedStyle(document.querySelector(".titlebar-root")).backgroundColor;
getComputedStyle(document.querySelector(".workbench_layout_sidebar")).backgroundColor;
getComputedStyle(document.documentElement).getPropertyValue("--desktop-opaque-surface-background");
```

If a light renderer becomes dark when unfocused, inspect `nativeTheme.themeSource`
and opaque-surface class before tuning opacity.

## Theme Common Layer

`src/cs/platform/theme/common` currently owns the shared token contracts and
registries that other layers may depend on:

- `colorRegistry.ts` / `colorUtils.ts` own `ColorIdentifier`, color defaults,
  transforms, registry lookup, and Conductor CSS variable helpers.
- `sizeRegistry.ts` / `sizeUtils.ts` own size identifiers, defaults, registry
  lookup, and Conductor CSS variable helpers.
- `colors/*` and `sizes/*` register built-in token ids. Add new token ids in
  the owning token file rather than hard-coding stringly color/size knowledge in
  consumers.
- `base/common/color.ts` is the concrete color value type (`Color`, `RGBA`,
  `HSLA`, `HSVA`). Do not use it for token ids. Decoration and theme contracts
  should carry `ColorIdentifier` when they mean a registered theme token.

This layer is not yet the full runtime theme service. Until the workbench theme
service is migrated onto the common registry, avoid assuming that registered
tokens are automatically emitted as live CSS variables. Components may consume
token ids as contracts, but runtime resolution/application still belongs to the
current workbench theme/appearance owners.

Use Conductor names for new schema and CSS variable surfaces:

```txt
ColorIdentifier / SizeIdentifier token id -> --conductor-<token-id-with-dashes>
schema ids -> conductor://schemas/...
```

Do not introduce new `--vscode-*` CSS variables or `vscode://schemas/...`
schema ids in Conductor-owned theme code. Existing upstream-derived variables
outside this theme layer may remain until their owning component is migrated.

## Tests

Appearance changes need owner-layer tests:

- electron-main focused/unfocused macOS style state and Windows unchanged behavior;
- renderer theme service macOS class detection and opaque-surface IPC;
- CSS review for root/body/#root, `.workbench_window`, titlebar, sidebar.

Do not call translucent chrome work complete until focused translucent and
unfocused/covered opaque states are covered by test or manual verification.
