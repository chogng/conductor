---
description: Desktop window appearance - macOS translucent chrome, opaque surfaces, native theme source, renderer backgrounds, and Windows Mica guardrails.
applyTo: 'src/cs/code/electron-main/app.ts,src/cs/platform/window/**,src/cs/platform/theme/**,src/cs/base/parts/sandbox/electron-browser/preload.ts,src/cs/workbench/services/themes/**,src/cs/workbench/browser/media/**,src/cs/workbench/browser/parts/sidebar/**,src/cs/workbench/browser/parts/titlebar/**,src/cs/workbench/contrib/themes/**'
---
# Desktop Appearance

Use this document when changing desktop window appearance, transparent chrome,
native material, title bar integration, sidebar backgrounds, theme-driven
window state, or renderer classes that affect the root workbench surface.

Desktop appearance is a two-layer system. Do not debug translucent sidebar
color as a single CSS opacity problem.

```txt
windows behind this app
  -> native window material or opaque fallback surface
  -> renderer DOM/CSS root, workbench, title bar, and sidebar backgrounds
  -> observed sidebar color
```

If either layer is dark, opaque, inactive, or using the wrong theme source, the
final sidebar can look wrong even when the other layer is configured correctly.

## Native Layer

The native layer owns Electron/macOS window material and platform window
options. Its owner is the electron-main window/app path, not workbench CSS.

For macOS translucent chrome:

- Prefer a normal titled window with `titleBarStyle: 'hiddenInset'`.
- Use a clear window background such as `#00000000`.
- Use native vibrancy, currently `vibrancy: 'menu'`, for the active translucent
  state.
- Do not rely on `transparent: true` as the visual effect. A pure transparent
  window shows through content, but it is not the same as macOS material.
- Do not use macOS `titleBarOverlay` to mimic Windows title bar behavior unless
  there is a proven platform reason.

MacOS material follows the system native theme. Before deriving an opaque
surface color from `nativeTheme.shouldUseDarkColors`, or before applying window
material, sync `nativeTheme.themeSource` from the app theme mode:

```txt
app theme light -> nativeTheme.themeSource = 'light'
app theme dark  -> nativeTheme.themeSource = 'dark'
app theme auto  -> nativeTheme.themeSource = 'system'
```

This is easy to miss. If the app renderer is light but `nativeTheme.themeSource`
is still system dark, AppKit can produce a dark opaque/material result behind a
light renderer. The symptom looks like a sidebar opacity bug, but the root cause
is the native layer using the wrong effective theme.

MacOS focus state also matters:

```txt
focused window
  -> clear background
  -> vibrancy enabled
  -> renderer uses translucent workbench/sidebar/titlebar backgrounds

unfocused or opaque surface state
  -> vibrancy disabled
  -> native background becomes #f9f9f9 in light mode or #000000 in dark mode
  -> renderer receives an opaque-surface event and uses the same surface color
```

When changing this flow, keep the native state and renderer state in sync. The
main process should send an explicit opaque-surface payload to the renderer
instead of expecting CSS to infer focus or vibrancy state.

## Renderer Layer

The renderer layer owns DOM classes, CSS variables, and component backgrounds.
It must not accidentally cover the native material with an opaque parent.

Important surfaces:

| Surface | Owner |
| --- | --- |
| root/body/#root transparent or opaque shell state | theme service plus `style.css` |
| `.workbench_window` parent surface and transparent chrome tint | `workbench/browser/media/window.css` |
| title bar surface | `workbench/browser/parts/titlebar/media/titlebar.css` |
| sidebar chrome contents and transparency | `workbench/browser/parts/sidebar/media/sidebarpart.css` |

For transparent chrome, the root and `#root` background must stay transparent.
The `.workbench_window` shell may carry one semi-transparent tint over native
material for the card-based Conductor layout. Keep that shell tint translucent;
a fully opaque parent background can completely hide native material.

When the main content is a card with rounded corners, use one tint strategy at
a time. The current Conductor card-shell pattern puts the tint on
`.workbench_window`, while sidebar and title bar stay transparent so they show
the same shell tint. Do not also add sidebar/titlebar tint layers unless the
product intentionally wants double compositing.

Keep component backgrounds with the component that owns the surface:

- Put workbench shell background rules in `window.css`.
- Put title bar background rules in `titlebar.css`.
- Put sidebar background rules in `sidebarpart.css`.
- Use global `style.css` only for cross-surface variables and root/body shell
  state.

Do not depend on only global CSS for component surfaces. Import order and
specificity can reintroduce an opaque component background after the global
rule runs.

The transparent chrome tint should use a renderer color over native material,
not a fully opaque theme color. Keep the tint value in one place so visual
tuning has an obvious effect.

## Windows Guardrails

Windows behavior is intentionally separate from macOS material.

- Preserve existing Windows Mica behavior unless the task explicitly asks for a
  Windows appearance change.
- Keep Windows tests in place when touching shared window appearance helpers.
- Do not toggle `setBackgroundMaterial` at runtime for macOS parity work.
- Do not let macOS-specific `vibrancy`, `titleBarStyle`, or opaque-surface
  changes alter Windows title bar overlay or Mica paths.

If a change is meant to be macOS-only, assert that in the owning helper and add
or update tests that run the Windows path on non-Windows hosts.

## Debugging Checklist

When the sidebar is too dark, too flat, or differs from another Electron app,
check both layers before tuning colors.

Native checks:

- Current platform and `BrowserWindow.isFocused()`.
- Applied `backgroundColor`, `vibrancy`, `transparent`, `titleBarStyle`, and
  title bar overlay options.
- `nativeTheme.themeSource` and `nativeTheme.shouldUseDarkColors`.
- Whether the window is in focused translucent mode or unfocused opaque surface
  mode.

Renderer checks from DevTools:

```js
document.documentElement.className;
getComputedStyle(document.body).backgroundColor;
getComputedStyle(document.querySelector('.workbench_window')).backgroundColor;
getComputedStyle(document.querySelector('.titlebar-root')).backgroundColor;
getComputedStyle(document.querySelector('.workbench_layout_sidebar')).backgroundColor;
getComputedStyle(document.documentElement).getPropertyValue('--desktop-opaque-surface-background');
```

Expected class flow:

```txt
transparent chrome enabled
  -> html.workbench-transparent-chrome

macOS renderer bridge available
  -> html.workbench-transparent-chrome-macos

native opaque surface active
  -> html.workbench-opaque-surface
```

If another Electron app turns light gray when unfocused over a dark window, but
this app turns dark gray, first inspect `nativeTheme.themeSource` and the
renderer opaque-surface class before adjusting opacity.

## Tests

Window appearance changes should include focused tests at the owning layer:

- electron-main window tests for macOS focused/unfocused style state and
  Windows unchanged behavior;
- renderer theme service tests for macOS class detection and opaque-surface IPC;
- CSS review for root/body/#root, `.workbench_window`, title bar, and sidebar
  backgrounds.

Do not call a translucent chrome fix complete until the test or manual
verification covers both a focused translucent window and an unfocused/covered
opaque surface window.
