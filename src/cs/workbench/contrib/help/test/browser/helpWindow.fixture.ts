import {
  createNLSConfiguration,
  setNLSConfiguration,
} from "src/cs/nls";
import { createHelpContent, type HelpContent } from "src/cs/workbench/contrib/help/browser/helpContent";
import type { HelpWindowKind } from "src/cs/workbench/contrib/help/common/helpWindow";

import "src/cs/workbench/contrib/help/browser/media/helpWindow.css";
import "src/cs/workbench/contrib/help/test/browser/helpWindow.fixture.css";

const kinds: readonly HelpWindowKind[] = ["changelog", "guide"];

const getInitialKind = (): HelpWindowKind => {
  const value = new URLSearchParams(window.location.search).get("kind");
  return value === "guide" ? "guide" : "changelog";
};

const getInitialTheme = (): "light" | "dark" => {
  const value = new URLSearchParams(window.location.search).get("theme");
  if (value === "dark" || value === "light") {
    return value;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: "light" | "dark"): void => {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme;
};

const renderContent = (content: HelpContent): HTMLElement => {
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
    const sectionElement = document.createElement("section");
    sectionElement.className = "help_window_section";

    const sectionTitle = document.createElement("h2");
    sectionTitle.className = "help_window_section_title";
    sectionTitle.textContent = section.title;
    sectionElement.append(sectionTitle);

    for (const paragraphText of section.body) {
      const paragraph = document.createElement("p");
      paragraph.className = "help_window_paragraph";
      paragraph.textContent = paragraphText;
      sectionElement.append(paragraph);
    }

    body.append(sectionElement);
  }

  root.append(header, body);
  return root;
};

const renderFixture = (host: HTMLElement): void => {
  let kind = getInitialKind();
  let theme = getInitialTheme();

  const toolbar = document.createElement("div");
  toolbar.className = "help_fixture_toolbar";

  const contentHost = document.createElement("div");
  contentHost.className = "help_fixture_content";

  const update = (): void => {
    applyTheme(theme);

    toolbar.replaceChildren(
      ...kinds.map(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "help_fixture_button";
        button.dataset.active = String(item === kind);
        button.textContent = item === "changelog" ? "Update Log" : "User Guide";
        button.addEventListener("click", () => {
          kind = item;
          update();
        });
        return button;
      }),
      createThemeButton(theme, () => {
        theme = theme === "dark" ? "light" : "dark";
        update();
      }),
    );

    contentHost.replaceChildren(renderContent(createHelpContent(kind)));
  };

  host.replaceChildren(toolbar, contentHost);
  update();
};

const createThemeButton = (
  theme: "light" | "dark",
  onClick: () => void,
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "help_fixture_button";
  button.textContent = theme === "dark" ? "Light" : "Dark";
  button.addEventListener("click", onClick);
  return button;
};

setNLSConfiguration(createNLSConfiguration("en"));
document.documentElement.lang = "en";

const root = document.getElementById("root");
if (root) {
  renderFixture(root);
}
