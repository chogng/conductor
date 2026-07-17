---
description: Workbench view architecture guidelines for Conductor - ownership boundaries between ViewsService, ViewPaneContainer, ViewPane, and feature views.
applyTo: 'src/cs/workbench/browser/parts/views/**,src/cs/workbench/services/views/**,src/cs/workbench/common/views.ts,src/cs/workbench/contrib/**/browser/**/*View*.ts,src/cs/workbench/contrib/**/browser/**/*.contribution.ts,src/cs/workbench/browser/workbench.contribution.ts'
---
# Workbench View Architecture

Use this when creating, migrating, or debugging workbench views, view panes,
view containers, and view contributions.

Conductor's view layer is close to VS Code concepts, but local implementations
are simplified. Verify local capabilities before copying upstream patterns.

## Current Boundary

Do not assume Conductor `ViewPane` has upstream VS Code `ViewPane` behavior.

Current responsibilities:

- `ViewPaneContainer`: rendered container title bar, container actions, active view selection, view collection, container layout.
- `ViewPane`: one view body shell, accessible label, focus behavior, visibility, pane-local layout hook, disposal.
- `ViewPaneOptions.title`: accessible label for the body, not a shared visual title bar.
- Concrete feature views: feature headers/content, subscriptions, actions, rendering.

Move title bar/action/progress/filter/welcome/collapsed-pane behavior into
`ViewPane` only after explicitly choosing to migrate toward the upstream
stacked/collapsible pane model.

## Layers

```txt
View contribution
  -> registry descriptors
  -> ViewsService creates runtime instances
  -> ViewPaneContainer owns visible container region
  -> ViewPane owns pane shell/lifecycle
  -> concrete feature view renders content
```

Registry/descriptors are declarative. `ViewsService` instantiates and tracks
visibility/focus/container mapping. `ViewPaneContainer` manages pane collection
and shared container UI. `ViewPane` owns one shell. Concrete panes own feature
UI and subscriptions.

Auxiliary Bar view switching is descriptor-driven. Feature contributions put
their title, icon, order, parent panel container, and default status on the
Auxiliary Bar `ViewContainer`; `IViewsService` activates the parent before the
Auxiliary Bar container, and the shared Auxiliary Bar renders the registered
containers. Do not create a parallel menu or string union to enumerate
Auxiliary Bar view containers.

## API Rules

Use `ViewsService` / `IViewsService` for runtime orchestration:

```ts
openView(id: string, focus?: boolean): Promise<IView | undefined>;
openViewContainer(id: string): Promise<IViewContainer | undefined>;
isViewVisible(id: string): boolean;
getViewContainerByViewId(id: string): ViewContainer | undefined;
```

`ViewsService` APIs use view/container ids, descriptors, visibility state, and
container/model objects. They must not expose feature-specific operations such
as `refreshFilesView()` or `recomputeAnalysis()`.

## Migration Rules

- Keep feature subscriptions in concrete panes unless the shared base truly owns them.
- If many panes need the same lifecycle/layout/focus/action/context-key capability, add it to `ViewPane` or the correct shared base.
- Check upstream inheritance before copying code; Conductor may lack inherited capabilities such as `_register`.
- Do not add a second shared title bar to `ViewPane` while `ViewPaneContainer` renders one.
- Do not mechanically replace imports or copy class bodies without checking owner layer, disposal owner, and visibility model.

## Lifecycle

Register disposables on the owner that creates them:

- `ViewsService`: service/model listeners.
- `ViewPaneContainer`: container events, resize observers, add/remove wiring.
- `ViewPane`: pane subscriptions and pane-local resources.
- method-local `DisposableStore`: repeated render/update artifacts.

## Blank Workbench Debugging

A startup contribution error can leave `#root` empty. Inspect the first console
error during contribution creation before changing HTML, preload, or layout.

Known pattern:

```txt
ExplorerViewPane extends ViewPane
  -> constructor calls this._register(...)
  -> local ViewPane lacks _register
  -> contribution creation throws
```

If many panes rely on the missing capability, fix the shared `ViewPane`
lifecycle rather than patching one pane or moving feature subscriptions into
`ViewPaneContainer`.
