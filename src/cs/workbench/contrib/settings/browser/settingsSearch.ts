export type SettingsSearchTerm = string | undefined | null | readonly (string | undefined | null)[];

export function getSettingsSearchWords(value: string): readonly string[] {
  return value
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function hasSettingsSearchQuery(value: string): boolean {
  return getSettingsSearchWords(value).length > 0;
}

export function normalizeSettingsSearchText(...terms: readonly SettingsSearchTerm[]): string {
  const values: string[] = [];
  for (const term of terms) {
    if (Array.isArray(term)) {
      for (const value of term) {
        if (value) {
          values.push(value);
        }
      }
      continue;
    }

    if (term) {
      values.push(term);
    }
  }
  return values.join(" ").toLocaleLowerCase();
}

export function setSettingsSearchText(element: HTMLElement, ...terms: readonly SettingsSearchTerm[]): void {
  element.dataset.search = normalizeSettingsSearchText(...terms);
}

export function settingsSearchMatches(searchText: string, queryWords: readonly string[]): boolean {
  return queryWords.every(word => searchText.includes(word));
}
