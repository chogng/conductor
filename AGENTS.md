# Repository Agent Instructions

## Instruction Resolution

These repository rules are mandatory. Within the repository instructions, an
applicable scoped `.github/instructions/*.instructions.md` rule governs its
declared paths and may define explicit path-specific exceptions to these general
defaults.

Before proposing or making repository code changes:

1. Read every `.github/instructions/*.instructions.md` file whose `applyTo`
   scope or documented responsibility matches the target change.
2. For changes under `src/cs/**`, always read:
   - `.github/instructions/coding-guidelines.instructions.md`
   - `.github/instructions/architecture.instructions.md`
3. Read `.github/instructions/commands.instructions.md` before changing command
   or action IDs, handlers, actions, menus, keybindings, contribution
   registration, or dispatch ownership.
4. Inspect upstream VS Code when the responsibility has a plausible upstream counterpart. Follow its ownership shape where applicable and justify any intentional divergence. The upstream checkouts are:
   - `..\vscode`
   - `../vscode`
5. Consult `.github/conductor-instructions.md` for repository overview and
   general conventions not covered by a more specific instruction.

Treat documentation as reference. Verify claims against the current code,
tests, and runtime behavior.

## Implementation Rules

- Fix behavior at its owning service, model, component, or primitive. Do not
  disguise an incomplete fix through renaming, moving, forwarding, wrapping,
  aliasing, re-exporting, or adapting the old behavior.
- When a contract changes, migrate affected call sites directly and remove the
  superseded path.
- Do not introduce fallback or compatibility logic merely to avoid the real
  fix. A fallback or migration bridge is allowed only when:
  - an applicable scoped instruction explicitly defines it;
  - the user explicitly requests it; or
  - a real external constraint requires it.
- Every allowed fallback or migration bridge must document why it exists, its
  exact boundary, and its deletion condition.
- Prefer the existing structure and local changes. Add a file only when it has
  a clear responsibility boundary, genuine reuse value, or materially improves
  the existing owner.

## Replacement Cleanup

After a replacement is complete, remove the obsolete compatibility entry
points and implementations.

Keep an empty file shell only when it remains structurally required. It must not
re-export, forward, delegate, alias, wrap, or preserve superseded behavior.
