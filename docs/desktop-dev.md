# Desktop Development Entry Points

Conductor keeps the upstream-style desktop development entry names:

- Windows: `scripts\code.bat`
- macOS/Linux: `./scripts/code.sh`

These scripts are the user-facing desktop development entry points. They set the
development environment and then call the shared TypeScript helper at
`scripts/dev-desktop.ts`.

## Current Responsibilities

`scripts/code.bat` and `scripts/code.sh`:

- enter the repository root
- set desktop development environment variables
- delegate to `npm run dev:desktop`

`scripts/dev-desktop.ts`:

- starts the Vite dev server
- starts the desktop TypeScript watcher
- waits for the dev server to be ready
- launches Electron
- watches compiled desktop output and restarts Electron on relevant changes
- shuts down child processes together

This differs from upstream VS Code, where `scripts/code.bat` and
`scripts/code.sh` can directly launch a prepared `.build/electron` runtime after
the upstream prelaunch/build pipeline has prepared it. Conductor currently uses
Vite and a smaller desktop build pipeline, so the cross-platform orchestration
lives in TypeScript instead of being duplicated across batch and shell scripts.

## Long-Term Direction

The desired shape is:

```text
scripts/code.*        user-facing desktop dev entry
build/dev task        shared desktop dev orchestration
src/main.ts           Electron app outer entry
src/cs/code/electron-main/main.ts
                      Electron main-process startup
```

Do not move the Vite/watch/restart loop into both `code.bat` and `code.sh`.
Keeping that logic in one TypeScript implementation avoids platform drift.

If the dev pipeline grows, move `scripts/dev-desktop.ts` toward a build task
module, such as `build/dev/desktop.ts` or `build/lib/devDesktop.ts`, and keep
`scripts/code.*` as thin entry scripts.
