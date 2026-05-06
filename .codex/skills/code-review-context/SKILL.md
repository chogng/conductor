---
name: code-review-context
description: Context size guidance
---

Keep added context bounded and easy to reason about.

Watch for:
- large preview-row caches or unbounded file data retained in React state
- oversized IPC payloads between renderer, preload, Electron main, and workers
- repeated serialization of workbook, CSV, template, or analysis data
- long-lived session/template state that grows without a clear cap
- worker or engine responses that become hard to inspect or cache

Flag anything that looks likely to become hard to cache, hard to inspect, or hard to keep under control.
