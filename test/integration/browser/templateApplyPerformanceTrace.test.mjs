import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  getApplyAllButton,
  readThumbnailHoverDomState,
  runTemplateApplyForThumbnailHover,
  waitForApplyAllReady,
  waitForTemplateApplyProcessingVisible,
  waitForTemplateProcessingBatch,
} from "./templateApplyPerformanceTrace/apply.mjs";
import { defaultOutputRoot } from "./templateApplyPerformanceTrace/constants.mjs";
import {
  createBrowserDropSpecs,
  createRunId,
  createUniqueImportFixture,
  dispatchBrowserFixtureDrop,
} from "./templateApplyPerformanceTrace/fixture.mjs";
import {
  runFileSwitchStress,
  runLiveFileSwitchStress,
} from "./templateApplyPerformanceTrace/fileSwitch.mjs";
import {
  runCoordinatedLiveInteractionStress,
} from "./templateApplyPerformanceTrace/liveInteraction.mjs";
import {
  formatMs,
  summarizeAnalysisPerfReport,
  summarizeFileSwitchLiveStress,
  summarizeFileSwitchSpeedComparison,
  summarizeFileSwitchStress,
  summarizeMilestones,
  summarizePhaseAnalysis,
  summarizeThumbnailHoverLiveStress,
  summarizeThumbnailHoverSpeedComparison,
  summarizeThumbnailHoverStress,
  summarizeTraceAnalysis,
  writePerformanceArtifacts,
} from "./templateApplyPerformanceTrace/report.mjs";
import {
  createPhaseRecorder,
  enableAnalysisPerf,
  getOpenFolderButton,
  installPageTraceObservers,
  openRuntime,
  readAnalysisPerfReport,
  readTraceState,
  startResourceSampler,
  startViteServer,
  stopPageTraceObservers,
  waitForTraceCompletion,
} from "./templateApplyPerformanceTrace/runtime.mjs";
import {
  resolveTemplateApplyPerformanceTraceScenario,
} from "./templateApplyPerformanceTrace/scenarios.mjs";
import {
  runLiveThumbnailHoverStress,
  runThumbnailHoverStress,
} from "./templateApplyPerformanceTrace/thumbnailHover.mjs";

const parseArgs = () => {
  const args = new Map();
  const flags = new Set();
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      args.set(key, rest.join("="));
    } else if (arg.startsWith("--")) {
      flags.add(arg.slice(2));
    }
  }

  const scenarioName = args.get("scenario") || null;
  const scenario = resolveTemplateApplyPerformanceTraceScenario(scenarioName);
  const scenarioDefaults = scenario?.defaults ?? {};
  const fileCount = readPositiveInteger(args.get("files"), scenarioDefaults.fileCount ?? 40);
  return {
    analysisPerf: !flags.has("no-analysis-perf"),
    autoBrowser: readBooleanFlag(flags, "auto-browser", scenarioDefaults.autoBrowser ?? false),
    autoFolder: readBooleanFlag(flags, "auto-folder", scenarioDefaults.autoFolder ?? false),
    browserChannel: args.get("browser-channel") || null,
    clean: !flags.has("keep-data"),
    fileSwitch: readBooleanFlag(flags, "file-switch", scenarioDefaults.fileSwitch ?? false),
    fileSwitchCount: readPositiveInteger(
      args.get("file-switch-count"),
      scenarioDefaults.fileSwitchCount ?? Math.min(20, fileCount),
    ),
    fileSwitchIntervalMs: readPositiveInteger(
      args.get("file-switch-interval-ms") || args.get("file-switch-storm-interval-ms"),
      scenarioDefaults.fileSwitchIntervalMs ?? 16,
    ),
    fileSwitchLive: readBooleanFlag(flags, "file-switch-live", scenarioDefaults.fileSwitchLive ?? false),
    fileSwitchLiveMs: readPositiveInteger(args.get("file-switch-live-ms"), scenarioDefaults.fileSwitchLiveMs ?? 8000),
    fileCount,
    inspector: readInspectorMode(args.get("inspector")),
    liveStressCoordinated: readBooleanFlag(
      flags,
      "live-stress-coordinated",
      scenarioDefaults.liveStressCoordinated ?? false,
    ),
    liveStressParallel: readBooleanFlag(flags, "live-stress-parallel", scenarioDefaults.liveStressParallel ?? false),
    outputRoot: path.resolve(args.get("out") || defaultOutputRoot),
    profile: args.get("profile") || scenarioDefaults.profile || "healthy",
    rowCount: readPositiveInteger(args.get("rows"), scenarioDefaults.rowCount ?? 4000),
    runtime: args.get("runtime") || scenarioDefaults.runtime || "browser",
    sampleMs: readPositiveInteger(args.get("sample-ms"), 100),
    scenario: scenarioName,
    splitReports: !flags.has("no-split-reports"),
    targetCollectionTimeoutMs: readPositiveInteger(
      args.get("target-collection-timeout-ms"),
      scenarioDefaults.targetCollectionTimeoutMs ?? 15000,
    ),
    thumbnailHover: readBooleanFlag(flags, "thumbnail-hover", scenarioDefaults.thumbnailHover ?? false),
    thumbnailHoverCount: readPositiveInteger(
      args.get("thumbnail-hover-count"),
      scenarioDefaults.thumbnailHoverCount ?? Math.min(12, fileCount),
    ),
    thumbnailHoverLive: readBooleanFlag(flags, "thumbnail-hover-live", scenarioDefaults.thumbnailHoverLive ?? false),
    thumbnailHoverLiveMs: readPositiveInteger(
      args.get("thumbnail-hover-live-ms"),
      scenarioDefaults.thumbnailHoverLiveMs ?? 8000,
    ),
    thumbnailHoverLiveWatchOnly: readBooleanFlag(
      flags,
      "thumbnail-hover-live-watch-only",
      scenarioDefaults.thumbnailHoverLiveWatchOnly ?? false,
    ),
    thumbnailHoverStormIntervalMs: readPositiveInteger(
      args.get("thumbnail-hover-storm-interval-ms"),
      scenarioDefaults.thumbnailHoverStormIntervalMs ?? 16,
    ),
    timeoutMs: readPositiveInteger(args.get("timeout-ms"), scenarioDefaults.timeoutMs ?? 120000),
    variant: args.get("variant") || args.get("run-label") || null,
    writeFullReport: !flags.has("no-full-report"),
  };
};

const readBooleanFlag = (flags, name, fallback) => {
  if (flags.has(`no-${name}`)) {
    return false;
  }
  if (flags.has(name)) {
    return true;
  }
  return fallback;
};

const readPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const readInspectorMode = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "hidden" || normalized === "off" || normalized === "closed") {
    return "hidden";
  }
  if (normalized === "visible" || normalized === "on" || normalized === "open") {
    return "visible";
  }

  throw new Error(`Unknown inspector mode "${value}". Use hidden or visible.`);
};

const createInitialLocalStorage = (options) => {
  if (!options.inspector) {
    return {};
  }

  return {
    "conductor.storage.0.chart.visibleDetailPanes": JSON.stringify({
      visibleDetailPanes: options.inspector === "visible" ? ["inspector"] : [],
    }),
  };
};

const main = async () => {
  const options = parseArgs();
  assert.ok(options.runtime === "browser" || options.runtime === "desktop", "runtime must be browser or desktop");
  const runId = createRunId();
  mkdirSync(options.outputRoot, { recursive: true });
  const fixture = await createUniqueImportFixture({
    fileCount: options.fileCount,
    outputRoot: options.outputRoot,
    profile: options.profile,
    rowCount: options.rowCount,
    runId,
  });
  const { fixtureRoot } = fixture;

  const server = await startViteServer();
  let runtime = null;
  let sampler = null;
  let phaseRecorder = null;
  try {
    runtime = await openRuntime({
      autoFolderPath: options.runtime === "desktop" && options.autoFolder ? fixtureRoot : null,
      baseUrl: server.baseUrl,
      browserChannel: options.browserChannel,
      initialLocalStorage: createInitialLocalStorage(options),
      runtime: options.runtime,
    });
    phaseRecorder = createPhaseRecorder(runtime.page, options.runtime);
    if (options.analysisPerf) {
      await enableAnalysisPerf(runtime.page);
    }
    await getOpenFolderButton(runtime.page).waitFor({ timeout: 30000 });
    await installPageTraceObservers(runtime.page);
    await phaseRecorder.mark("runtime.ready", {
      analysisPerf: options.analysisPerf,
      autoBrowser: options.autoBrowser,
      autoFolder: options.autoFolder,
      fileCount: options.fileCount,
      rowCount: options.rowCount,
    });
    sampler = startResourceSampler({
      page: runtime.page,
      processRootPid: runtime.processRootPid,
      runtime: options.runtime,
      sampleMs: options.sampleMs,
    });

    console.log(`[template-apply-performance-trace] runtime=${options.runtime}`);
    console.log(`[template-apply-performance-trace] scenario=${options.scenario ?? "custom"}`);
    console.log(`[template-apply-performance-trace] workload=${JSON.stringify({
      fileCount: options.fileCount,
      fileSwitchCount: options.fileSwitchCount,
      liveStressCoordinated: options.liveStressCoordinated,
      liveStressParallel: options.liveStressParallel,
      rowCount: options.rowCount,
      targetCollectionTimeoutMs: options.targetCollectionTimeoutMs,
      thumbnailHoverCount: options.thumbnailHoverCount,
    })}`);
    console.log(`[template-apply-performance-trace] fixture=${fixtureRoot}`);
    console.log(`[template-apply-performance-trace] profile=${fixture.profile} composition=${JSON.stringify(fixture.composition)}`);
    console.log("[template-apply-performance-trace] Click Open Folder in the app and select the fixture directory.");
    console.log("[template-apply-performance-trace] Waiting for all assessment badges...");
    if (options.autoFolder) {
      assert.equal(options.runtime, "desktop", "--auto-folder is currently supported for desktop runtime");
      await phaseRecorder.mark("import.dispatch.start", {
        method: "desktop-auto-folder",
      });
      await getOpenFolderButton(runtime.page).click();
      await phaseRecorder.mark("import.dispatch.end", {
        method: "desktop-auto-folder",
      });
    } else if (options.autoBrowser) {
      const files = createBrowserDropSpecs({
        fixture,
        rowCount: options.rowCount,
        runId,
      });
      await runtime.page.locator(".file-list-viewport").waitFor({ timeout: 30000 });
      await phaseRecorder.mark("import.dispatch.start", {
        fileCount: files.length,
        method: "browser-drop",
      });
      await dispatchBrowserFixtureDrop(runtime.page, {
        files,
        rowCount: options.rowCount,
        runId,
      });
      await phaseRecorder.mark("import.dispatch.end", {
        fileCount: files.length,
        method: "browser-drop",
      });
    }
    const finalState = await waitForTraceCompletion({
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
      page: runtime.page,
      timeoutMs: options.timeoutMs,
    });
    await phaseRecorder.mark("import.ready", {
      assessmentBadgeCount: finalState.dom?.assessment ?? null,
      prepareCompletionCount: fixture.expectedPrepareCompletionCount,
    });
    let thumbnailApply = null;
    let thumbnailHover = null;
    let thumbnailHoverLive = null;
    let fileSwitch = null;
    let fileSwitchLive = null;
    if (options.thumbnailHoverLive || options.fileSwitchLive) {
      const liveLabels = [
        options.thumbnailHoverLive ? "thumbnail hover" : null,
        options.fileSwitchLive ? "file switch" : null,
      ].filter(Boolean).join(" + ");
      console.log(`[template-apply-performance-trace] Applying template and immediately running live ${liveLabels} stress...`);
      const before = await readThumbnailHoverDomState(runtime.page);
      await waitForApplyAllReady(runtime.page, options.timeoutMs);
      const applyStartedAt = Date.now();
      await phaseRecorder.mark("apply.click.start", {
        fileSwitchLive: options.fileSwitchLive,
        thumbnailHoverLive: options.thumbnailHoverLive,
      });
      await getApplyAllButton(runtime.page).click();
      await phaseRecorder.mark("apply.click.end");
      await waitForTemplateApplyProcessingVisible(runtime.page, options.timeoutMs);
      await phaseRecorder.mark("apply.processing-visible");
      const afterClick = await readThumbnailHoverDomState(runtime.page);
      let processingBatchMs = null;
      const processingDone = waitForTemplateProcessingBatch(runtime.page, options.timeoutMs)
        .then(async (value) => {
          processingBatchMs = Date.now() - applyStartedAt;
          await phaseRecorder.mark("processing.done", {
            processingBatchMs,
          });
          return value;
        });
      const runThumbnailHoverLiveStressTask = async () => {
        await phaseRecorder.mark("live.thumbnailHover.start", {
          count: options.thumbnailHoverCount,
          intervalMs: options.thumbnailHoverStormIntervalMs,
          liveMs: options.thumbnailHoverLiveMs,
          watchOnly: options.thumbnailHoverLiveWatchOnly,
        });
        thumbnailHoverLive = await runLiveThumbnailHoverStress({
          count: options.thumbnailHoverCount,
          intervalMs: options.thumbnailHoverStormIntervalMs,
          liveMs: options.thumbnailHoverLiveMs,
          page: runtime.page,
          timeoutMs: options.timeoutMs,
          watchOnly: options.thumbnailHoverLiveWatchOnly,
        });
        await phaseRecorder.mark("live.thumbnailHover.end", {
          eventCount: thumbnailHoverLive?.eventCount ?? null,
          targetCount: thumbnailHoverLive?.targetCount ?? null,
        });
      };
      const runFileSwitchLiveStressTask = async () => {
        await phaseRecorder.mark("live.fileSwitch.start", {
          count: options.fileSwitchCount,
          intervalMs: options.fileSwitchIntervalMs,
          liveMs: options.fileSwitchLiveMs,
        });
        fileSwitchLive = await runLiveFileSwitchStress({
          count: options.fileSwitchCount,
          intervalMs: options.fileSwitchIntervalMs,
          liveMs: options.fileSwitchLiveMs,
          page: runtime.page,
          timeoutMs: options.timeoutMs,
        });
        await phaseRecorder.mark("live.fileSwitch.end", {
          eventCount: fileSwitchLive?.eventCount ?? null,
          targetCount: fileSwitchLive?.targetCount ?? null,
        });
      };
      if (
        options.liveStressCoordinated &&
        options.liveStressParallel &&
        options.thumbnailHoverLive &&
        options.fileSwitchLive &&
        !options.thumbnailHoverLiveWatchOnly
      ) {
        await phaseRecorder.mark("live.thumbnailHover.start", {
          coordinated: true,
          count: options.thumbnailHoverCount,
          intervalMs: options.thumbnailHoverStormIntervalMs,
          liveMs: options.thumbnailHoverLiveMs,
          watchOnly: false,
        });
        await phaseRecorder.mark("live.fileSwitch.start", {
          coordinated: true,
          count: options.fileSwitchCount,
          intervalMs: options.fileSwitchIntervalMs,
          liveMs: options.fileSwitchLiveMs,
        });
        const coordinatedLive = await runCoordinatedLiveInteractionStress({
          fileSwitchCount: options.fileSwitchCount,
          fileSwitchIntervalMs: options.fileSwitchIntervalMs,
          fileSwitchLiveMs: options.fileSwitchLiveMs,
          page: runtime.page,
          thumbnailHoverCount: options.thumbnailHoverCount,
          thumbnailHoverIntervalMs: options.thumbnailHoverStormIntervalMs,
          thumbnailHoverLiveMs: options.thumbnailHoverLiveMs,
          timeoutMs: options.timeoutMs,
        });
        thumbnailHoverLive = coordinatedLive.thumbnailHoverLive;
        fileSwitchLive = coordinatedLive.fileSwitchLive;
        await phaseRecorder.mark("live.thumbnailHover.end", {
          coordinated: true,
          eventCount: thumbnailHoverLive?.eventCount ?? null,
          targetCount: thumbnailHoverLive?.targetCount ?? null,
        });
        await phaseRecorder.mark("live.fileSwitch.end", {
          coordinated: true,
          eventCount: fileSwitchLive?.eventCount ?? null,
          targetCount: fileSwitchLive?.targetCount ?? null,
        });
      } else {
        const liveStressTasks = [
          ...(options.thumbnailHoverLive ? [runThumbnailHoverLiveStressTask] : []),
          ...(options.fileSwitchLive ? [runFileSwitchLiveStressTask] : []),
        ];
        if (options.liveStressParallel) {
          await Promise.all(liveStressTasks.map(task => task()));
        } else {
          for (const task of liveStressTasks) {
            await task();
          }
        }
      }
      await processingDone;
      await runtime.page.waitForTimeout(300);
      thumbnailApply = {
        after: await readThumbnailHoverDomState(runtime.page),
        afterClick,
        before,
        durationMs: Date.now() - applyStartedAt,
        expectedReadyCount: Math.max(
          options.thumbnailHoverLive ? options.thumbnailHoverCount : 0,
          options.fileSwitchLive ? options.fileSwitchCount : 0,
        ),
        live: true,
        processingBatchMs,
      };
    }
    if (options.thumbnailHover) {
      if (!thumbnailApply) {
        console.log("[template-apply-performance-trace] Applying template before thumbnail hover stress...");
        await phaseRecorder.mark("apply.stable.start", {
          reason: "thumbnail-hover",
        });
        thumbnailApply = await runTemplateApplyForThumbnailHover({
          expectedReadyCount: options.thumbnailHoverCount,
          expectedTargetCount: Math.min(options.thumbnailHoverCount, options.fileCount),
          page: runtime.page,
          timeoutMs: options.timeoutMs,
        });
        await phaseRecorder.mark("processing.done", {
          processingBatchMs: thumbnailApply.durationMs,
          reason: "stable-apply",
        });
      }
      console.log("[template-apply-performance-trace] Running thumbnail hover stress...");
      await phaseRecorder.mark("stable.thumbnailHover.start", {
        count: options.thumbnailHoverCount,
      });
      thumbnailHover = await runThumbnailHoverStress({
        count: options.thumbnailHoverCount,
        page: runtime.page,
        targetCollectionTimeoutMs: options.targetCollectionTimeoutMs,
        timeoutMs: options.timeoutMs,
      });
      await phaseRecorder.mark("stable.thumbnailHover.end", {
        targetCount: thumbnailHover?.targetCount ?? null,
      });
    }
    if (options.fileSwitch) {
      if (!thumbnailApply) {
        console.log("[template-apply-performance-trace] Applying template before file switch stress...");
        await phaseRecorder.mark("apply.stable.start", {
          reason: "file-switch",
        });
        thumbnailApply = await runTemplateApplyForThumbnailHover({
          expectedReadyCount: options.fileSwitchCount,
          expectedTargetCount: Math.min(options.fileSwitchCount, options.fileCount),
          page: runtime.page,
          timeoutMs: options.timeoutMs,
        });
        await phaseRecorder.mark("processing.done", {
          processingBatchMs: thumbnailApply.durationMs,
          reason: "stable-apply",
        });
      }
      console.log("[template-apply-performance-trace] Running file switch stress...");
      await phaseRecorder.mark("stable.fileSwitch.start", {
        count: options.fileSwitchCount,
      });
      fileSwitch = await runFileSwitchStress({
        count: options.fileSwitchCount,
        page: runtime.page,
        targetCollectionTimeoutMs: options.targetCollectionTimeoutMs,
        timeoutMs: options.timeoutMs,
      });
      await phaseRecorder.mark("stable.fileSwitch.end", {
        targetCount: fileSwitch?.targetCount ?? null,
      });
    }
    if (options.thumbnailHover || options.fileSwitch) {
      await phaseRecorder.mark("stable.end", {
        fileSwitch: Boolean(fileSwitch),
        thumbnailHover: Boolean(thumbnailHover),
      });
    }
    sampler.stop();
    const analysisPerfReport = options.analysisPerf
      ? await readAnalysisPerfReport(runtime.page)
      : null;
    const reportTraceState = await readTraceState(runtime.page).catch(() => finalState);
    const milestones = summarizeMilestones(finalState.events, {
      expectedAssessmentBadgeCount: fixture.expectedAssessmentBadgeCount,
      expectedPrepareCompletionCount: fixture.expectedPrepareCompletionCount,
    });
    const thumbnailHoverSummary = summarizeThumbnailHoverStress(thumbnailHover, analysisPerfReport);
    const thumbnailHoverLiveSummary = summarizeThumbnailHoverLiveStress(
      thumbnailHoverLive,
      analysisPerfReport,
      phaseRecorder.anchors,
    );
    const fileSwitchSummary = summarizeFileSwitchStress(fileSwitch);
    const fileSwitchLiveSummary = summarizeFileSwitchLiveStress(
      fileSwitchLive,
      phaseRecorder.anchors,
      analysisPerfReport,
    );
    const analysis = {
      ...summarizeTraceAnalysis({
        events: finalState.events,
        fixture,
        milestones,
        resourceSamples: sampler.samples,
      }),
      analysisPerf: summarizeAnalysisPerfReport(analysisPerfReport),
      phaseAnalysis: summarizePhaseAnalysis({
        analysisPerfReport,
        phaseAnchors: phaseRecorder.anchors,
        resourceSamples: sampler.samples,
        traceEvents: reportTraceState.events,
      }),
      thumbnailHover: thumbnailHoverSummary,
      thumbnailHoverLive: thumbnailHoverLiveSummary,
      thumbnailHoverSpeedComparison: summarizeThumbnailHoverSpeedComparison({
        apply: thumbnailApply,
        live: thumbnailHoverLive,
        liveSummary: thumbnailHoverLiveSummary,
        stable: thumbnailHover,
        stableSummary: thumbnailHoverSummary,
      }),
      fileSwitch: fileSwitchSummary,
      fileSwitchLive: fileSwitchLiveSummary,
      fileSwitchSpeedComparison: summarizeFileSwitchSpeedComparison({
        apply: thumbnailApply,
        liveSummary: fileSwitchLiveSummary,
        stableSummary: fileSwitchSummary,
      }),
    };
    const generatedAt = new Date().toISOString();
    const report = {
      analysis,
      analysisPerfReport,
      fixture,
      fixtureRoot,
      generatedAt,
      options,
      phaseAnchors: phaseRecorder.anchors,
      runId,
      runtime: options.runtime,
      finalDomState: reportTraceState.dom,
      milestones,
      resourceSamples: sampler.samples,
      thumbnailApply,
      thumbnailHover,
      thumbnailHoverLive,
      fileSwitch,
      fileSwitchLive,
      traceEvents: reportTraceState.events,
    };
    const reportPath = path.join(options.outputRoot, `${runId}-${options.runtime}.json`);
    if (options.writeFullReport) {
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`[template-apply-performance-trace] fullReport=${reportPath}`);
    }
    const artifactPaths = options.splitReports
      ? writePerformanceArtifacts({
        analysis,
        analysisPerfReport,
        fixture,
        generatedAt,
        milestones,
        options,
        phaseAnchors: phaseRecorder.anchors,
        rawReportPath: options.writeFullReport ? reportPath : null,
        resourceSamples: sampler.samples,
        runId,
        runtime: options.runtime,
        thumbnailApply,
      })
      : null;
    if (artifactPaths) {
      console.log(`[template-apply-performance-trace] summary=${artifactPaths.summaryPath}`);
      console.log(`[template-apply-performance-trace] history=${artifactPaths.historyPath}`);
      console.log(`[template-apply-performance-trace] historyCsv=${artifactPaths.historyCsvPath}`);
      console.log(`[template-apply-performance-trace] historySvg=${artifactPaths.historySvgPath}`);
      console.log(`[template-apply-performance-trace] blocks=${JSON.stringify(artifactPaths.blockPaths, null, 2)}`);
    }
    console.log(`[template-apply-performance-trace] milestones=${JSON.stringify(Object.fromEntries(Object.entries(milestones).map(([key, value]) => [key, value == null ? null : formatMs(value)])), null, 2)}`);
    if (artifactPaths) {
      console.log(`[template-apply-performance-trace] metrics=${JSON.stringify(artifactPaths.metricsRow.metrics, null, 2)}`);
      if (artifactPaths.comparison) {
        console.log(`[template-apply-performance-trace] comparison=${JSON.stringify(artifactPaths.comparison, null, 2)}`);
      }
    } else {
      console.log(`[template-apply-performance-trace] analysisSummary=${JSON.stringify({
        bottleneckHints: analysis.bottleneckHints,
        resources: analysis.resources,
        stages: analysis.stages,
      }, null, 2)}`);
    }
  } finally {
    sampler?.stop();
    if (runtime?.page) {
      await stopPageTraceObservers(runtime.page);
    }
    await runtime?.close()?.catch?.(() => {});
    await server.close();
    if (options.clean && existsSync(fixtureRoot)) {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
};

await main();
