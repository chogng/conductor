import {
  dispatchSyntheticFileSelectTarget,
  inspectMainChartState,
  installFileSwitchLiveObserver,
  isPendingFileSwitchTarget,
  stopFileSwitchLiveObserver,
  waitForMainChartCanvas,
  waitForMainChartDrawn,
  waitForSelectedFile,
} from "./fileSwitch.mjs";
import {
  dispatchSyntheticFileHoverTarget,
  installThumbnailHoverLiveObserver,
  mergeThumbnailHoverTargets,
  readVisibleThumbnailHoverTargets,
  scrollThumbnailHoverListByWheel,
  stopThumbnailHoverLiveObserver,
  waitForCollectedThumbnailHoverTargets,
} from "./thumbnailHover.mjs";

const LIVE_INTERACTION_SCROLL_DELTA_Y = 420;
const LIVE_INTERACTION_SETTLE_TIMEOUT_MS = 400;

export const runCoordinatedLiveInteractionStress = async ({
  fileSwitchCount,
  fileSwitchIntervalMs,
  fileSwitchLiveMs,
  page,
  thumbnailHoverCount,
  thumbnailHoverIntervalMs,
  thumbnailHoverLiveMs,
  timeoutMs,
}) => {
  const requestedTargetCount = Math.max(thumbnailHoverCount, fileSwitchCount);
  let targets = orderPendingInteractionTargets(await waitForCollectedThumbnailHoverTargets(
    page,
    requestedTargetCount,
    Math.min(timeoutMs, 5000),
    750,
  ));
  const watchedTarget = targets[0] ?? null;
  if (!watchedTarget) {
    return createEmptyCoordinatedLiveResult({
      fileSwitchCount,
      fileSwitchIntervalMs,
      fileSwitchLiveMs,
      thumbnailHoverCount,
      thumbnailHoverIntervalMs,
      thumbnailHoverLiveMs,
    });
  }

  await installThumbnailHoverLiveObserver(page, watchedTarget.fileId);
  await installFileSwitchLiveObserver(page);

  const startedAt = Date.now();
  const liveMs = Math.max(thumbnailHoverLiveMs, fileSwitchLiveMs);
  const liveDeadlineAt = startedAt + liveMs;
  const [hoverLane, switchLane] = await Promise.all([
    runCoordinatedThumbnailHoverLane({
      count: requestedTargetCount,
      intervalMs: thumbnailHoverIntervalMs,
      liveDeadlineAt,
      liveMs: thumbnailHoverLiveMs,
      page,
      previousTargets: targets,
      startedAt,
      watchedTarget,
    }),
    runCoordinatedFileSwitchLane({
      count: fileSwitchCount,
      intervalMs: fileSwitchIntervalMs,
      liveDeadlineAt,
      liveMs: fileSwitchLiveMs,
      page,
      startedAt,
      targets,
    }),
  ]);
  targets = orderPendingInteractionTargets(mergeThumbnailHoverTargets(targets, hoverLane.targets));

  const settleSample = await settleLastFileSwitch({
    beforeState: null,
    page,
    switchStartedAt: switchLane.lastSwitchStartedAt,
    target: switchLane.lastSwitchTarget,
    timeoutMs,
  });
  const durationMs = Date.now() - startedAt;
  const hoverTrace = await stopThumbnailHoverLiveObserver(page);
  const switchTrace = await stopFileSwitchLiveObserver(page);

  return {
    fileSwitchLive: {
      durationMs,
      eventCount: switchLane.eventCount,
      intervalMs: fileSwitchIntervalMs,
      liveMs: fileSwitchLiveMs,
      requestedCount: fileSwitchCount,
      settleSample,
      targetCount: Math.min(targets.length, fileSwitchCount),
      targets: targets.slice(0, fileSwitchCount),
      trace: switchTrace,
    },
    thumbnailHoverLive: {
      durationMs,
      eventCount: hoverLane.eventCount,
      intervalMs: thumbnailHoverIntervalMs,
      liveMs: thumbnailHoverLiveMs,
      requestedCount: thumbnailHoverCount,
      targetCount: Math.min(targets.length, thumbnailHoverCount),
      targets: targets.slice(0, thumbnailHoverCount),
      trace: hoverTrace,
      watchOnly: false,
      watchedTarget,
    },
  };
};

const runCoordinatedThumbnailHoverLane = async ({
  count,
  intervalMs,
  liveDeadlineAt,
  liveMs,
  page,
  previousTargets,
  startedAt,
  watchedTarget,
}) => {
  const attemptedFileIds = new Set();
  let targets = previousTargets;
  let eventCount = 0;
  let targetCursor = 0;
  let previousHoverFileId = null;
  while (Date.now() < liveDeadlineAt && Date.now() - startedAt < liveMs) {
    const target = await resolveNextCoordinatedTarget({
      attemptedFileIds,
      count,
      page,
      targets,
      targetCursor,
    });
    targets = target.targets;
    targetCursor = target.targetCursor;
    if (!target.value) {
      break;
    }
    if (Date.now() >= liveDeadlineAt || Date.now() - startedAt >= liveMs) {
      break;
    }

    attemptedFileIds.add(target.value.fileId);
    const dispatched = await dispatchSyntheticFileHoverTarget(
      page,
      target.value,
      previousHoverFileId,
    );
    if (dispatched) {
      previousHoverFileId = target.value.fileId;
    }
    eventCount += 1;

    const remainingMs = Math.min(
      liveDeadlineAt - Date.now(),
      startedAt + liveMs - Date.now(),
    );
    if (remainingMs > 0) {
      await page.waitForTimeout(Math.min(intervalMs, remainingMs));
    }
  }

  if (watchedTarget.fileId !== previousHoverFileId) {
    await dispatchSyntheticFileHoverTarget(page, watchedTarget, previousHoverFileId).catch(() => false);
    await page.waitForTimeout(Math.max(50, intervalMs * 2));
  }

  return {
    eventCount,
    targets,
  };
};

const runCoordinatedFileSwitchLane = async ({
  count,
  intervalMs,
  liveDeadlineAt,
  liveMs,
  page,
  startedAt,
  targets,
}) => {
  const switchTargets = orderPendingInteractionTargets(targets).slice(0, count);
  let eventCount = 0;
  let lastSwitchStartedAt = null;
  let lastSwitchTarget = null;
  while (
    switchTargets.length > 0 &&
    Date.now() < liveDeadlineAt &&
    Date.now() - startedAt < liveMs
  ) {
    const target = switchTargets[eventCount % switchTargets.length];
    if (!target) {
      break;
    }

    lastSwitchStartedAt = Date.now();
    lastSwitchTarget = target;
    await dispatchSyntheticFileSelectTarget(page, target);
    eventCount += 1;

    const remainingMs = Math.min(
      liveDeadlineAt - Date.now(),
      startedAt + liveMs - Date.now(),
    );
    if (remainingMs > 0) {
      await page.waitForTimeout(Math.min(intervalMs, remainingMs));
    }
  }

  return {
    eventCount,
    lastSwitchStartedAt,
    lastSwitchTarget,
  };
};

const createEmptyCoordinatedLiveResult = ({
  fileSwitchCount,
  fileSwitchIntervalMs,
  fileSwitchLiveMs,
  thumbnailHoverCount,
  thumbnailHoverIntervalMs,
  thumbnailHoverLiveMs,
}) => ({
  fileSwitchLive: {
    durationMs: 0,
    eventCount: 0,
    intervalMs: fileSwitchIntervalMs,
    liveMs: fileSwitchLiveMs,
    requestedCount: fileSwitchCount,
    settleSample: null,
    targetCount: 0,
    targets: [],
    trace: null,
  },
  thumbnailHoverLive: {
    durationMs: 0,
    eventCount: 0,
    intervalMs: thumbnailHoverIntervalMs,
    liveMs: thumbnailHoverLiveMs,
    requestedCount: thumbnailHoverCount,
    targetCount: 0,
    targets: [],
    trace: null,
    watchedTarget: null,
  },
});

const resolveNextCoordinatedTarget = async ({
  attemptedFileIds,
  count,
  page,
  targets,
  targetCursor,
}) => {
  const visibleTargets = await readVisibleThumbnailHoverTargets(page, count);
  targets = orderPendingInteractionTargets(mergeThumbnailHoverTargets(targets, visibleTargets)).slice(0, count);
  const orderedVisibleTargets = orderPendingInteractionTargets(visibleTargets);
  const visibleUnattempted = orderedVisibleTargets.find(target => !attemptedFileIds.has(target.fileId));
  if (visibleUnattempted) {
    return {
      targetCursor,
      targets,
      value: visibleUnattempted,
    };
  }

  await scrollThumbnailHoverListByWheel(page, LIVE_INTERACTION_SCROLL_DELTA_Y);
  const nextVisibleTargets = await readVisibleThumbnailHoverTargets(page, count);
  targets = orderPendingInteractionTargets(mergeThumbnailHoverTargets(targets, nextVisibleTargets)).slice(0, count);
  const orderedNextVisibleTargets = orderPendingInteractionTargets(nextVisibleTargets);
  const nextVisibleUnattempted = orderedNextVisibleTargets.find(target => !attemptedFileIds.has(target.fileId));
  if (nextVisibleUnattempted) {
    return {
      targetCursor,
      targets,
      value: nextVisibleUnattempted,
    };
  }

  const fallbackTargets = orderedNextVisibleTargets.length
    ? orderedNextVisibleTargets
    : orderedVisibleTargets.length
      ? orderedVisibleTargets
      : targets;
  if (!fallbackTargets.length) {
    return {
      targetCursor,
      targets,
      value: null,
    };
  }

  const value = fallbackTargets[targetCursor % fallbackTargets.length];
  return {
    targetCursor: targetCursor + 1,
    targets,
    value,
  };
};

const orderPendingInteractionTargets = (targets) => [
  ...targets.filter(isPendingFileSwitchTarget),
  ...targets.filter(target => !isPendingFileSwitchTarget(target)),
];

const settleLastFileSwitch = async ({
  beforeState,
  page,
  switchStartedAt,
  target,
  timeoutMs,
}) => {
  if (!target || switchStartedAt == null) {
    return null;
  }

  let selectedMs = null;
  let canvasVisibleMs = null;
  let chartDrawnMs = null;
  try {
    await waitForSelectedFile(page, target.fileId, Math.min(timeoutMs, LIVE_INTERACTION_SETTLE_TIMEOUT_MS));
    selectedMs = Date.now() - switchStartedAt;
  } catch {
    selectedMs = null;
  }
  try {
    await waitForMainChartCanvas(page, target.fileId, Math.min(timeoutMs, LIVE_INTERACTION_SETTLE_TIMEOUT_MS));
    canvasVisibleMs = Date.now() - switchStartedAt;
  } catch {
    canvasVisibleMs = null;
  }
  try {
    await waitForMainChartDrawn(
      page,
      target.fileId,
      beforeState?.canvasSignature ?? null,
      Math.min(timeoutMs, LIVE_INTERACTION_SETTLE_TIMEOUT_MS),
    );
    chartDrawnMs = Date.now() - switchStartedAt;
  } catch {
    chartDrawnMs = null;
  }

  return {
    ...target,
    afterState: await inspectMainChartState(page),
    beforeState,
    canvasVisibleMs,
    chartDrawnMs,
    selectedMs,
  };
};
