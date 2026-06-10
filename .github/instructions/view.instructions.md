---
description: Workbench view architecture guidelines for Conductor - ownership boundaries between ViewsService, ViewPaneContainer, ViewPane, and concrete feature views.
applyTo: 'src/cs/workbench/browser/parts/views/**,src/cs/workbench/services/views/**,src/cs/workbench/common/views.ts,src/cs/workbench/contrib/**/browser/**/*View*.ts,src/cs/workbench/contrib/**/browser/**/*.contribution.ts,src/cs/workbench/browser/workbench.contribution.ts'
---
# Workbench View Architecture

Use this document when creating, migrating, or debugging workbench views, view panes, view containers, and view contributions.

Conductor's view layer is intentionally close to VS Code's workbench concepts, but some local implementations are simplified. When migrating from upstream, verify that the local abstraction still carries the inherited capabilities that upstream code assumes.

## Overview

The workbench view system has four runtime layers.

```txt
View contribution
  -> registers ViewContainer and IViewDescriptor metadata
  -> ViewsService reads the registry/model and creates runtime instances
  -> ViewPaneContainer owns the visible container region and its pane collection
  -> ViewPane owns one pane shell and pane-local lifecycle
  -> concrete feature view renders feature content and talks to feature services
```

The registry and descriptors are declarative. They describe what containers and views exist, where they belong, and which constructors create them. They do not own DOM or runtime subscriptions.

`ViewsService` turns descriptors into live objects. It is the bridge between the declarative registry/model layer and rendered workbench parts.

`ViewPaneContainer` is the rendered container surface. It manages a set of panes as a group and forwards layout and visibility changes to them.

`ViewPane` is the rendered pane shell. It provides the common pane contract that concrete feature views build on.

Concrete feature views are the leaf layer. They render feature-specific DOM, subscribe to feature services, and expose feature actions.

## Ownership boundaries

Keep responsibilities at the correct layer.

```txt
Views registry/model
  -> ViewsService
  -> ViewPaneContainer
  -> ViewPane
  -> concrete feature view
```

`ViewsService` owns registry/model wiring, instantiation, visibility bookkeeping, focus context keys, and the mapping between view ids and container ids. It should not know about feature-specific subscriptions or pane internals.

`ViewPaneContainer` owns a collection of views or panes. It adds, removes, lays out, hides, shows, and orders panes inside one container. It should not manage the internal subscriptions of a concrete feature view.

`ViewPane` owns one pane shell: pane DOM, body/header structure, collapsed state, focus behavior, layout hooks, and pane-local lifecycle helpers.

Concrete `ViewPane` subclasses own feature UI/content, feature service subscriptions, feature actions, and feature-specific rendering.

## Migration rules

Do not move concrete view subscriptions into `ViewPaneContainer` just because multiple views need disposal. If the subscription belongs to the feature pane, register it on the pane.

Do not create a separate ad hoc lifecycle pattern in every concrete pane to work around a missing base capability. If many `ViewPane` subclasses need the same lifecycle, layout, focus, action, or context-key capability, add it to `ViewPane` or the appropriate shared base abstraction.

When migrating from VS Code, check the upstream inheritance chain before copying a pattern. Upstream `ViewPane` inherits capabilities through `Pane`, including `_register`/disposable lifecycle behavior. If Conductor's simplified local `ViewPane` does not have the same inherited capability, decide whether to add the capability to the local base class before changing concrete views.

Do not mechanically replace imports or copy upstream class bodies without checking:

- which layer owns the state or DOM being changed;
- whether the local base class has the expected inherited methods;
- whether disposal belongs to `ViewsService`, `ViewPaneContainer`, `ViewPane`, or the concrete feature view;
- whether view visibility is model-driven or an ad hoc DOM toggle.

## Lifecycle rule

Pane-local disposables should be registered immediately on the owner that creates them.

Use `ViewPane` lifecycle helpers for subscriptions created by a concrete pane constructor or pane method. Use `ViewPaneContainer` disposables only for container-level resources such as resize observers, container events, and add/remove wiring. Use `ViewsService` disposables only for service-level listeners and registered container model lifetime.

If a concrete pane creates resources repeatedly during render or update, use a method-local `DisposableStore` that is cleared and disposed by the pane, rather than registering every render artifact directly on the long-lived pane.

## Blank page learning

A blank workbench can happen when a view contribution fails during startup before the root workbench DOM is mounted.

One known failure mode was:

```txt
FilesPaneHost extends ViewPane
  -> constructor calls this._register(...)
  -> local ViewPane did not provide _register
  -> contribution creation throws
  -> #root remains empty
```

The correct fix direction is to restore the missing `ViewPane` lifecycle capability when multiple pane subclasses rely on it. Do not move the feature subscriptions into `ViewPaneContainer`, and do not patch only one concrete pane if the pattern is shared by other panes.

When debugging a blank workbench, inspect the first console error during contribution creation before changing startup HTML, preload, or container layout code.
