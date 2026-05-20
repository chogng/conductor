import { useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
} from "src/cs/workbench/contrib/chartPreview/lib/origin/originPlotOptions";
import type {
  IonIoffMethod,
  SsMethod,
} from "src/cs/workbench/contrib/deviceAnalysis/session/analysis-session-context";
import type { LooseTranslateFn as TranslateFn } from "src/cs/workbench/common/deviceAnalysis/translateTypes";
import {
  getSettings,
  updateSettings,
} from "./settingsService";
import {
  getInitialSettingsSnapshot,
  toAnalysisSettings,
  type AnalysisSettings,
} from "./settingsShared";

type UseCoreSettingsOptions = {
  language: LanguageCode;
  setIonIoffMethod: (method: IonIoffMethod) => void;
  setLanguage: (language: LanguageCode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  setGmDiagnosticsEnabled: (enabled: boolean) => void;
  setSsDiagnosticsEnabled: (enabled: boolean) => void;
  setVthDiagnosticsEnabled: (enabled: boolean) => void;
  setSsMethod: (method: SsMethod) => void;
  setSsShowFitLine: (enabled: boolean) => void;
  t: TranslateFn;
};

type UpdateSettingsFn = (
  updates: unknown,
) => Promise<AnalysisSettings | null>;

export const useCoreSettings = ({
  language,
  setIonIoffMethod,
  setLanguage,
  theme,
  setTheme,
  setGmDiagnosticsEnabled,
  setSsDiagnosticsEnabled,
  setVthDiagnosticsEnabled,
  setSsMethod,
  setSsShowFitLine,
  t: _t,
}: UseCoreSettingsOptions) => {
  const initialSettingsSnapshot = getInitialSettingsSnapshot();
  const [analysisSettings, setAnalysisSettings] =
    useState<AnalysisSettings | null>(initialSettingsSnapshot);
  const [analysisSettingsLoaded, setAnalysisSettingsLoaded] =
    useState(Boolean(initialSettingsSnapshot));

  const mergeAnalysisSettings = useCallback(
    (nextSettings: AnalysisSettings | null) => {
      setAnalysisSettings((prev) =>
        nextSettings ? { ...(prev || {}), ...nextSettings } : prev ?? null,
      );
    },
    [],
  );

  const handleUpdateAnalysisSettings: UpdateSettingsFn =
    useCallback(async (updates: unknown) => {
      const patch = updates && typeof updates === "object" ? updates : null;
      if (!patch) return null;

      const updated = toAnalysisSettings(
        await updateSettings(patch),
      );
      mergeAnalysisSettings(updated);
      return updated;
    }, [mergeAnalysisSettings]);

  const handleLanguageChange = useCallback(
    async (nextLanguage: LanguageCode) => {
      if (nextLanguage !== "zh" && nextLanguage !== "en") return;
      if (language === nextLanguage) return;

      setLanguage(nextLanguage);

      try {
        await handleUpdateAnalysisSettings({ language: nextLanguage });
      } catch {
        // keep UI responsive even if persistence fails
      }
    },
    [handleUpdateAnalysisSettings, language, setLanguage],
  );

  const handleThemeChange = useCallback(
    async (nextTheme: ThemeMode) => {
      if (nextTheme !== "system" && nextTheme !== "light" && nextTheme !== "dark") {
        return;
      }
      if (theme === nextTheme) return;

      setTheme(nextTheme);

      try {
        await handleUpdateAnalysisSettings({ theme: nextTheme });
      } catch {
        // keep UI responsive even if persistence fails
      }
    },
    [handleUpdateAnalysisSettings, setTheme, theme],
  );

  useEffect(() => {
    let cancelled = false;

    const applyLoadedSettings = (settings: AnalysisSettings | null) => {
      setAnalysisSettings(settings ?? null);

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
        ssMethodDefault === "manual"
      ) {
        setSsMethod(ssMethodDefault);
      }

      if (typeof settings?.ssDiagnosticsEnabled === "boolean") {
        setSsDiagnosticsEnabled(settings.ssDiagnosticsEnabled);
      }

      if (typeof settings?.vthDiagnosticsEnabled === "boolean") {
        setVthDiagnosticsEnabled(settings.vthDiagnosticsEnabled);
      }

      if (typeof settings?.gmDiagnosticsEnabled === "boolean") {
        setGmDiagnosticsEnabled(settings.gmDiagnosticsEnabled);
      }

      if (typeof settings?.ssShowFitLine === "boolean") {
        setSsShowFitLine(settings.ssShowFitLine);
      }
    };

    if (initialSettingsSnapshot) {
      applyLoadedSettings(initialSettingsSnapshot);
      setAnalysisSettingsLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    setAnalysisSettingsLoaded(false);

    (async () => {
      try {
        const settings = toAnalysisSettings(
          await getSettings(),
        );
        if (cancelled) return;

        applyLoadedSettings(settings);
      } catch {
        // ignore settings load failures
      } finally {
        if (!cancelled) {
          setAnalysisSettingsLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    initialSettingsSnapshot,
    setIonIoffMethod,
    setLanguage,
    setTheme,
    setSsDiagnosticsEnabled,
    setVthDiagnosticsEnabled,
    setSsMethod,
    setSsShowFitLine,
  ]);

  const originOpenPlotOptions = useMemo(() => {
    const settings = analysisSettings || {};
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
  }, [analysisSettings]);

  return {
    analysisSettings,
    analysisSettingsLoaded,
    handleLanguageChange,
    handleThemeChange,
    handleUpdateAnalysisSettings,
    mergeAnalysisSettings,
    originOpenPlotOptions,
  };
};
