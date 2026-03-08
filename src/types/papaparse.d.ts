declare module "papaparse" {
  type ParseConfig = Record<string, unknown>;

  const Papa: {
    parse: (input: unknown, config: ParseConfig) => void;
    unparse: (input: unknown) => string;
  };

  export default Papa;
}
