---
name: code-review-breaking-changes
description: Review for breaking changes
---

Search for breaking changes in external integration surfaces:
- Electron main/preload IPC contracts in `desktop/`
- device-analysis import, preview, template, analysis, and export flows
- Origin worker scripts and packaged `origin/bin` resources
- Rust/XLS engine commands and packaged `excel/bin` resources
- desktop release, updater, installer, and signing configuration
- persisted sessions, saved templates, file formats, exports, and demo assets

Do not stop after finding one issue.
Check all places where existing users or automation could break.
