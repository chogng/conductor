# Device Analysis State Guidelines

This feature uses three different state tiers. New state should be placed deliberately so UI behavior stays predictable and persistence remains intentional.

## 1. Runtime UI State

Use runtime-only state for transient interaction details that should reset when the page reloads or the app reopens.

Examples:
- Dragging, hovering, resizing, focus, temporary panel openness
- In-progress pointer or selection overlays
- Layout adjustments that do not represent a durable user preference

Preferred storage:
- Local component state
- Refs
- Feature hooks scoped to the current page lifetime

Rule:
- Do not persist runtime UI state to `localStorage`, desktop config, or other storage unless users have a strong expectation that the value should survive app restarts.

## 2. Session State

Use session state for active work that should survive tab or route switches inside Device Analysis, but does not need to survive a full app restart.

Examples:
- Imported files in the current working session
- Current preview file
- Current template editing state before an explicit save
- Current analysis selections for the live session

Preferred storage:
- `SessionProvider`

Rule:
- Session state may be long-lived within the mounted feature tree, but it is still not persisted storage.

## 3. Persisted Settings

Use persisted settings only for durable preferences, explicit user configuration, or recovery-critical values.

Examples:
- Language and theme
- Origin executable path and Origin defaults
- SS default options
- Configurable persistence path
- Onboarding completion or auto-dismiss state

Preferred storage:
- Desktop store / desktop config via the settings service

Rule:
- Persist only when the value is either:
  - a clear user preference they expect to keep, or
  - required to restore important app behavior across restarts.

## Decision Checklist

Before persisting a new value, ask:

1. Would a user be surprised if this resets after restart?
2. Does this value affect app behavior beyond the current screen?
3. Is this an explicit preference or configuration, rather than a temporary interaction?
4. Will persisting it create hidden layout or migration problems later?

If the answer to 1-3 is mostly "no", keep it out of persisted storage.

## Current Guidance For This Feature

- Sidebar width: runtime-only
- Import card interaction state: runtime-only
- Imported working set: session state
- Template editing before save: session state
- Saved template defaults and settings: persisted
- Onboarding completion/dismissal: persisted
