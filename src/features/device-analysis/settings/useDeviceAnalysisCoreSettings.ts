import { useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "../../../context/language";
import type { ThemeMode } from "../../../context/theme";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
} from "../analysis/lib/originPlotOptions";
import type { SsMethod } from "../session/device-analysis-session-context";
import type { LooseTranslateFn as TranslateFn } from "../shared/lib/translateTypes";
import {
  getDeviceAnalysisSettings,
  updateDeviceAnalysisSettings,
} from "./deviceAnalysisSettingsService";
import {
  getInitialDeviceAnalysisSettingsSnapshot,
  toDeviceAnalysisSettings,
  type DeviceAnalysisSettings,
} from "./deviceAnalysisSettingsShared";

type UseDeviceAnalysisCoreSettingsOptions = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  setSsDiagnosticsEnabled: (enabled: boolean) => void;
  setSsIdWindow: (window: { high: string; low: string }) => void;
  setSsMethod: (method: SsMethod) => void;
  setSsShowFitLine: (enabled: boolean) => void;
  t: TranslateFn;
};

type UpdateDeviceAnalysisSettingsFn = (
  updates: unknown,
) => Promise<DeviceAnalysisSettings | null>;

export const useDeviceAnalysisCoreSettings = ({
  language,
  setLanguage,
  theme,
  setTheme,
  setSsDiagnosticsEnabled,
  setSsIdWindow,
  setSsMethod,
  setSsShowFitLine,
  t: _t,
}: UseDeviceAnalysisCoreSettingsOptions) => {
  const initialSettingsSnapshot = getInitialDeviceAnalysisSettingsSnapshot();
  const [deviceAnalysisSettings, setDeviceAnalysisSettings] =
    useState<DeviceAnalysisSettings | null>(initialSettingsSnapshot);
  const [deviceAnalysisSettingsLoaded, setDeviceAnalysisSettingsLoaded] =
    useState(Boolean(initialSettingsSnapshot));

  const mergeDeviceAnalysisSettings = useCallback(
    (nextSettings: DeviceAnalysisSettings | null) => {
      setDeviceAnalysisSettings((prev) =>
        nextSettings ? { ...(prev || {}), ...nextSettings } : prev ?? null,
      );
    },
    [],
  );

  const handleUpdateDeviceAnalysisSettings: UpdateDeviceAnalysisSettingsFn =
    useCallback(async (updates: unknown) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return null;

      const updated = toDeviceAnalysisSettings(
        await updateDeviceAnalysisSettings(patch),
      );
      mergeDeviceAnalysisSettings(updated);
      return updated;
    }, [mergeDeviceAnalysisSettings]);

  const handleLanguageChange = useCallback(
    async (nextLanguage: LanguageCode) => {
      if (nextLanguage !== "zh" && nextLanguage !== "en") return;
      if (language === nextLanguage) return;

      setLanguage(nextLanguage);

      try {
        await handleUpdateDeviceAnalysisSettings({ language: nextLanguage });
      } catch {
        // keep UI responsive even if persistence fails
      }
    },
    [handleUpdateDeviceAnalysisSettings, language, setLanguage],
  );

  const handleThemeChange = useCallback(
    async (nextTheme: ThemeMode) => {
      if (nextTheme !== "system" && nextTheme !== "light" && nextTheme !== "dark") {
        return;
      }
      if (theme === nextTheme) return;

      setTheme(nextTheme);

      try {
        await handleUpdateDeviceAnalysisSettings({ theme: nextTheme });
      } catch {
        // keep UI responsive even if persistence fails
      }
    },
    [handleUpdateDeviceAnalysisSettings, setTheme, theme],
  );

  useEffect(() => {
    let cancelled = false;

    const applyLoadedSettings = (settings: DeviceAnalysisSettings | null) => {
      setDeviceAnalysisSettings(settings ?? null);

      const nextLanguage = settings?.language;
      if (nextLanguage === "zh" || nextLanguage === "en") {
        setLanguage(nextLanguage);
      }

      const nextTheme = settings?.theme;
      if (nextTheme === "system" || nextTheme === "light" || nextTheme === "dark") {
        setTheme(nextTheme);
      }

      const ssMethodDefault = settings?.ssMethodDefault;
      if (
        ssMethodDefault === "auto" ||
        ssMethodDefault === "manual" ||
        ssMethodDefault === "idWindow" ||
        ssMethodDefault === "legacy"
      ) {
        setSsMethod(ssMethodDefault);
      }

      if (typeof settings?.ssDiagnosticsEnabled === "boolean") {
        setSsDiagnosticsEnabled(settings.ssDiagnosticsEnabled);
      }

      if (typeof settings?.ssShowFitLine === "boolean") {
        setSsShowFitLine(settings.ssShowFitLine);
      }

      const low = Number(settings?.ssIdLow);
      const high = Number(settings?.ssIdHigh);
      if (
        Number.isFinite(low) &&
        Number.isFinite(high) &&
        low > 0 &&
        high > 0
      ) {
        setSsIdWindow({ low: String(low), high: String(high) });
      }
    };

    if (initialSettingsSnapshot) {
      applyLoadedSettings(initialSettingsSnapshot);
      setDeviceAnalysisSettingsLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    setDeviceAnalysisSettingsLoaded(false);

    (async () => {
      try {
        const settings = toDeviceAnalysisSettings(
          await getDeviceAnalysisSettings(),
        );
        if (cancelled) return;

        applyLoadedSettings(settings);
      } catch {
        // ignore settings load failures
      } finally {
        if (!cancelled) {
          setDeviceAnalysisSettingsLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    initialSettingsSnapshot,
    setLanguage,
    setTheme,
    setSsDiagnosticsEnabled,
    setSsIdWindow,
    setSsMethod,
    setSsShowFitLine,
  ]);

  const originOpenPlotOptions = useMemo(() => {
    const settings = deviceAnalysisSettings || {};
    return normalizeOriginPlotOptions(
      {
        command: settings.originPlotCommandDefault,
        postCommands: settings.originPlotPostCommandsDefault,
        type: settings.originPlotTypeDefault,
        lineWidth: settings.originPlotLineWidthDefault,
        xyPairs: settings.originPlotXyPairsDefault,
      },
      DEFAULT_ORIGIN_PLOT_OPTIONS,
    );
  }, [deviceAnalysisSettings]);

  return {
    deviceAnalysisSettings,
    deviceAnalysisSettingsLoaded,
    handleLanguageChange,
    handleThemeChange,
    handleUpdateDeviceAnalysisSettings,
    mergeDeviceAnalysisSettings,
    originOpenPlotOptions,
  };
};
