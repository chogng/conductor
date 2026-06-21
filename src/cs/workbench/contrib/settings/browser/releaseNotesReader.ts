/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getNLSLanguage, type NLSLanguage } from "src/cs/nls";

import enReleaseNotesMarkdown from "src/cs/workbench/contrib/settings/browser/releaseNotes/current.en.md?raw";
import zhReleaseNotesMarkdown from "src/cs/workbench/contrib/settings/browser/releaseNotes/current.zh.md?raw";

export type ReleaseNotesMarkdownInput = {
  readonly currentVersion?: string | null;
  readonly fallbackVersionLabel: string;
};

const releaseNotesByLanguage: Record<NLSLanguage, string> = {
  en: enReleaseNotesMarkdown,
  zh: zhReleaseNotesMarkdown,
};

export function readBundledReleaseNotesMarkdown(input: ReleaseNotesMarkdownInput): string {
  const version = input.currentVersion?.trim() || input.fallbackVersionLabel;
  const markdown = releaseNotesByLanguage[getNLSLanguage()] ?? enReleaseNotesMarkdown;
  return markdown.replaceAll("{{version}}", version);
}
