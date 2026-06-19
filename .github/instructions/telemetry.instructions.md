---
description: Use when adding or changing telemetry events.
---
# Telemetry

Telemetry must be type-safe, GDPR-classified, and privacy-minimal.

## Pattern

Define event and classification types:

```ts
type MyFeatureEvent = {
  action: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
};

type MyFeatureClassification = {
  action: { classification: "SystemMetaData"; purpose: "FeatureInsight"; comment: "The action performed." };
  durationMs: { classification: "SystemMetaData"; purpose: "PerformanceAndHealth"; isMeasurement: true; comment: "Duration in milliseconds." };
  success: { classification: "SystemMetaData"; purpose: "FeatureInsight"; isMeasurement: true; comment: "Whether the operation succeeded." };
  errorCode: { classification: "SystemMetaData"; purpose: "PerformanceAndHealth"; comment: "Stable error code when failed." };
  owner: "yourGitHubUsername";
  comment: "Tracks MyFeature usage and performance.";
};
```

Send normal events with `publicLog2`:

```ts
this.telemetryService.publicLog2<MyFeatureEvent, MyFeatureClassification>("myFeatureAction", {
  action: "buttonClick",
  durationMs: 150,
  success: true,
});
```

Send error events with `publicLogError2` and classify actual error messages or
stacks as `CallstackOrException`.

Inject `ITelemetryService` through DI.

## Classifications

| Classification | Use |
| --- | --- |
| `SystemMetaData` | feature usage, preferences, ids, counts, durations, success flags |
| `CallstackOrException` | actual error messages, stack traces, exception details |
| `PublicNonPersonalData` | already public data; rare |

Purposes:

- `FeatureInsight`: feature usage/adoption.
- `PerformanceAndHealth`: errors, performance, diagnostics.

Required:

- `owner`;
- field `comment`;
- `isMeasurement: true` for numeric values used in calculations/metrics.

## Naming And Privacy

- Event names use camelCase with context.
- Property names are specific: `agentId`, `durationMs`, `kind`, `source`.
- Common booleans: `success`, `hasError`, `isEnabled`.
- Do not collect PII: usernames, emails, file paths, file contents, raw user input.
- Prefer categories or hashes over raw values.
- Minimize to essential insight only.
- Do not use vague comments or incorrect classifications.
