/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getNLSLanguage, type NLSLanguage } from "src/cs/nls";

import enUserGuideMarkdown from "src/cs/workbench/contrib/settings/browser/userGuide/current.en.md?raw";
import zhUserGuideMarkdown from "src/cs/workbench/contrib/settings/browser/userGuide/current.zh.md?raw";

const userGuideByLanguage: Record<NLSLanguage, string> = {
  en: enUserGuideMarkdown,
  zh: zhUserGuideMarkdown,
};

export function readBundledUserGuideMarkdown(): string {
  return userGuideByLanguage[getNLSLanguage()] ?? enUserGuideMarkdown;
}
