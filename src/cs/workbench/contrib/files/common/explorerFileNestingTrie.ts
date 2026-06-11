/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

type FilenameAttributes = {
  readonly basename: string;
  readonly dirname: string;
  readonly extname: string;
};

export type ExplorerFileNestingPattern = readonly [
  parentPattern: string,
  childPatterns: readonly string[],
];

export class ExplorerFileNestingTrie {
  private readonly root = new PreTrie();

  public constructor(config: readonly ExplorerFileNestingPattern[]) {
    for (const [parentPattern, childPatterns] of config) {
      for (const childPattern of childPatterns) {
        this.root.add(parentPattern, childPattern);
      }
    }
  }

  public toString(): string {
    return this.root.toString();
  }

  public nest(files: readonly string[], dirname: string): Map<string, Set<string>> {
    const parentFinder = new PreTrie();

    for (const potentialParent of files) {
      const attributes = getFilenameAttributes(potentialParent, dirname);
      const children = this.root.get(potentialParent, attributes);
      for (const child of children) {
        parentFinder.add(child, potentialParent);
      }
    }

    const findAllRootAncestors = (
      file: string,
      seen: Set<string> = new Set(),
    ): string[] => {
      if (seen.has(file)) {
        return [];
      }

      seen.add(file);
      const attributes = getFilenameAttributes(file, dirname);
      const ancestors = parentFinder.get(file, attributes);
      if (ancestors.length === 0) {
        return [file];
      }

      if (ancestors.length === 1 && ancestors[0] === file) {
        return [file];
      }

      return ancestors.flatMap(ancestor => findAllRootAncestors(ancestor, seen));
    };

    const result = new Map<string, Set<string>>();
    for (const file of files) {
      let ancestors = findAllRootAncestors(file);
      if (ancestors.length === 0) {
        ancestors = [file];
      }

      for (const ancestor of ancestors) {
        let existing = result.get(ancestor);
        if (!existing) {
          existing = new Set();
          result.set(ancestor, existing);
        }

        if (file !== ancestor) {
          existing.add(file);
        }
      }
    }

    return result;
  }
}

export class PreTrie {
  private readonly value: SufTrie = new SufTrie();
  private readonly map = new Map<string, PreTrie>();

  public add(key: string, value: string): void {
    if (key === "" || key[0] === "*") {
      this.value.add(key, value);
      return;
    }

    const head = key[0];
    const rest = key.slice(1);
    let existing = this.map.get(head);
    if (!existing) {
      existing = new PreTrie();
      this.map.set(head, existing);
    }
    existing.add(rest, value);
  }

  public get(key: string, attributes: FilenameAttributes): string[] {
    const results: string[] = [];
    results.push(...this.value.get(key, attributes));

    const head = key[0];
    const rest = key.slice(1);
    const existing = this.map.get(head);
    if (existing) {
      results.push(...existing.get(rest, attributes));
    }

    return results;
  }

  public toString(indentation = ""): string {
    const lines: string[] = [];
    if (this.value.hasItems) {
      lines.push(`* => \n${this.value.toString(`${indentation}  `)}`);
    }

    for (const [key, trie] of this.map.entries()) {
      lines.push(`^${key} => \n${trie.toString(`${indentation}  `)}`);
    }

    return lines.map(line => indentation + line).join("\n");
  }
}

export class SufTrie {
  private readonly star: SubstitutionString[] = [];
  private readonly epsilon: SubstitutionString[] = [];
  private readonly map = new Map<string, SufTrie>();
  public hasItems = false;

  public add(key: string, value: string): void {
    this.hasItems = true;
    if (key === "*") {
      this.star.push(new SubstitutionString(value));
      return;
    }

    if (key === "") {
      this.epsilon.push(new SubstitutionString(value));
      return;
    }

    const tail = key[key.length - 1];
    const rest = key.slice(0, key.length - 1);
    if (tail === "*") {
      throw new Error(`Unexpected star in SufTrie key: ${key}`);
    }

    let existing = this.map.get(tail);
    if (!existing) {
      existing = new SufTrie();
      this.map.set(tail, existing);
    }
    existing.add(rest, value);
  }

  public get(key: string, attributes: FilenameAttributes): string[] {
    const results: string[] = [];
    if (key === "") {
      results.push(...this.epsilon.map(substitution => substitution.substitute(attributes)));
    }

    if (this.star.length) {
      results.push(...this.star.map(substitution => substitution.substitute(attributes, key)));
    }

    const tail = key[key.length - 1];
    const rest = key.slice(0, key.length - 1);
    const existing = this.map.get(tail);
    if (existing) {
      results.push(...existing.get(rest, attributes));
    }

    return results;
  }

  public toString(indentation = ""): string {
    const lines: string[] = [];
    if (this.star.length) {
      lines.push(`* => ${this.star.join("; ")}`);
    }

    if (this.epsilon.length) {
      lines.push(`<empty> => ${this.epsilon.join("; ")}`);
    }

    for (const [key, trie] of this.map.entries()) {
      lines.push(`${key}$ => \n${trie.toString(`${indentation}  `)}`);
    }

    return lines.map(line => indentation + line).join("\n");
  }
}

const enum SubstitutionType {
  Basename = "basename",
  Capture = "capture",
  Dirname = "dirname",
  Extname = "extname",
}

const substitutionStringTokenizer = /\$[({](capture|basename|dirname|extname)[)}]/g;

class SubstitutionString {
  private readonly tokens: Array<string | { readonly capture: SubstitutionType }> = [];

  public constructor(pattern: string) {
    substitutionStringTokenizer.lastIndex = 0;
    let token: RegExpExecArray | null;
    let lastIndex = 0;
    while ((token = substitutionStringTokenizer.exec(pattern))) {
      const prefix = pattern.slice(lastIndex, token.index);
      this.tokens.push(prefix);

      const type = token[1];
      switch (type) {
        case SubstitutionType.Basename:
        case SubstitutionType.Capture:
        case SubstitutionType.Dirname:
        case SubstitutionType.Extname:
          this.tokens.push({ capture: type });
          break;
        default:
          throw new Error(`Unknown substitution type: ${type}`);
      }
      lastIndex = token.index + token[0].length;
    }

    if (lastIndex !== pattern.length) {
      this.tokens.push(pattern.slice(lastIndex));
    }
  }

  public substitute(attributes: FilenameAttributes, capture?: string): string {
    return this.tokens.map(token => {
      if (typeof token === "string") {
        return token;
      }

      switch (token.capture) {
        case SubstitutionType.Basename:
          return attributes.basename;
        case SubstitutionType.Capture:
          return capture || "";
        case SubstitutionType.Dirname:
          return attributes.dirname;
        case SubstitutionType.Extname:
          return attributes.extname;
      }
    }).join("");
  }

  public toString(): string {
    return this.tokens
      .map(token => typeof token === "string" ? token : `$(${token.capture})`)
      .join("");
  }
}

const getFilenameAttributes = (
  filename: string,
  dirname: string,
): FilenameAttributes => {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 1) {
    return {
      basename: filename,
      dirname,
      extname: "",
    };
  }

  return {
    basename: filename.substring(0, lastDot),
    dirname,
    extname: filename.substring(lastDot + 1),
  };
};
