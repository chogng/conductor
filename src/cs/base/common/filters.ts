/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export interface IMatch {
  start: number;
  end: number;
}

export interface IFilter {
  (word: string, wordToMatchAgainst: string): IMatch[] | null;
}

export const matchesPrefix: IFilter = (word, wordToMatchAgainst) => {
  if (word.length > wordToMatchAgainst.length) {
    return null;
  }

  if (!wordToMatchAgainst.toLowerCase().startsWith(word.toLowerCase())) {
    return null;
  }

  return word.length === 0 ? [] : [{ start: 0, end: word.length }];
};

export const matchesFuzzy2: IFilter = (word, wordToMatchAgainst) => {
  if (!word) {
    return [];
  }

  const needle = word.toLowerCase();
  const haystack = wordToMatchAgainst.toLowerCase();
  const matches: IMatch[] = [];
  let matchStart = -1;
  let previousIndex = -1;
  let searchFrom = 0;

  for (let index = 0; index < needle.length; index += 1) {
    const nextIndex = haystack.indexOf(needle[index], searchFrom);
    if (nextIndex === -1) {
      return null;
    }

    if (matchStart === -1) {
      matchStart = nextIndex;
    } else if (nextIndex !== previousIndex + 1) {
      matches.push({ start: matchStart, end: previousIndex + 1 });
      matchStart = nextIndex;
    }

    previousIndex = nextIndex;
    searchFrom = nextIndex + 1;
  }

  matches.push({ start: matchStart, end: previousIndex + 1 });
  return matches;
};
