declare module "papaparse" {
  export type ParseConfig = {
    delimiter?: string;
    preview?: number;
    skipEmptyLines?: boolean;
    [key: string]: unknown;
  };

  export type ParseResult = {
    data: Array<Array<unknown> | null | undefined>;
  };

  export type UnparseInput =
    | Array<Array<unknown>>
    | {
        data: Array<Array<unknown>>;
        fields: string[];
      };

  export interface PapaParse {
    parse(input: string, config?: ParseConfig): ParseResult;
    unparse(input: UnparseInput): string;
  }

  const Papa: PapaParse;

  export default Papa;
}
