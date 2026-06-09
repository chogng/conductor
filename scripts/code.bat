@echo off
setlocal

title Conductor Studio Dev

pushd %~dp0\..

:: Upstream-style desktop dev entrypoint.
:: Keep repository-specific orchestration in scripts/dev-desktop.ts:
:: Vite, desktop TypeScript watch, Electron launch, and restart handling.
set NODE_ENV=development
set CONDUCTOR_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

call npm.cmd run dev:desktop -- %*
set EXIT_CODE=%ERRORLEVEL%

popd
endlocal & exit /b %EXIT_CODE%
