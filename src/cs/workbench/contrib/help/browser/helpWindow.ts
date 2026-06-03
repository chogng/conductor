import {
  createNLSConfiguration,
  setNLSConfiguration,
} from "src/cs/nls";
import {
  normalizeHelpWindowKind,
  type HelpWindowKind,
} from "src/cs/workbench/contrib/help/common/helpWindow";
import { createHelpContent } from "src/cs/workbench/contrib/help/browser/helpContent";
import "src/cs/workbench/contrib/help/browser/media/helpWindow.css";

type HelpWindowConfiguration = {
  readonly initialWorkbenchSettings?: {
    readonly language?: unknown;
    readonly theme?: unknown;
  };
};

const getConfiguration = (): HelpWindowConfiguration => {
  try {
    const value = window.conductor?.context?.configuration?.();
    const settings =
      value?.initialWorkbenchSettings &&
      typeof value.initialWorkbenchSettings === "object"
        ? value.initialWorkbenchSettings
        : {};
    return {
      initialWorkbenchSettings: {
        language: settings.language,
        theme: settings.theme,
      },
    };
  } catch {
    return {};
  }
};

const getHelpWindowKind = (): HelpWindowKind => {
  const params = new URLSearchParams(window.location.search);
  return normalizeHelpWindowKind(params.get("kind"));
};

const applyLanguage = (configuration: HelpWindowConfiguration): void => {
  const language = configuration.initialWorkbenchSettings?.language;
  setNLSConfiguration(createNLSConfiguration(language));
  document.documentElement.lang = String(language).toLowerCase().startsWith("zh")
    ? "zh-CN"
    : "en";
};

const applyTheme = (configuration: HelpWindowConfiguration): void => {
  const theme = configuration.initialWorkbenchSettings?.theme;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = theme === "dark" || (theme === "system" && prefersDark)
    ? "dark"
    : "light";
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
};

const renderHelpWindow = (kind: HelpWindowKind): HTMLElement => {
  const content = createHelpContent(kind);
  const root = document.createElement("main");
  root.className = "help_window";

  const header = document.createElement("header");
  header.className = "help_window_header";

  const title = document.createElement("h1");
  title.className = "help_window_title";
  title.textContent = content.title;

  const subtitle = document.createElement("p");
  subtitle.className = "help_window_subtitle";
  subtitle.textContent = content.subtitle;
  header.append(title, subtitle);

  const body = document.createElement("div");
  body.className = "help_window_body";
  for (const section of content.sections) {
    body.append(createSection(section.title, section.body));
  }

  root.append(header, body);
  return root;
};

const createSection = (titleText: string, paragraphs: readonly string[]): HTMLElement => {
  const section = document.createElement("section");
  section.className = "help_window_section";

  const title = document.createElement("h2");
  title.className = "help_window_section_title";
  title.textContent = titleText;
  section.append(title);

  for (const paragraphText of paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.className = "help_window_paragraph";
    paragraph.textContent = paragraphText;
    section.append(paragraph);
  }

  return section;
};

const configuration = getConfiguration();
applyLanguage(configuration);
applyTheme(configuration);

const root = document.getElementById("root");
if (root) {
  root.replaceChildren(renderHelpWindow(getHelpWindowKind()));
}
