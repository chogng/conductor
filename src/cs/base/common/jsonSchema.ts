export type JSONSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "array"
  | "object";

export interface IJSONSchema {
  id?: string;
  $id?: string;
  $schema?: string;
  type?: JSONSchemaType | JSONSchemaType[];
  title?: string;
  default?: unknown;
  definitions?: IJSONSchemaMap;
  description?: string;
  properties?: IJSONSchemaMap;
  patternProperties?: IJSONSchemaMap;
  additionalProperties?: boolean | IJSONSchema;
  minProperties?: number;
  maxProperties?: number;
  dependencies?: IJSONSchemaMap | { [property: string]: string[] };
  items?: IJSONSchema | IJSONSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  additionalItems?: boolean | IJSONSchema;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean | number;
  exclusiveMaximum?: boolean | number;
  multipleOf?: number;
  required?: string[];
  $ref?: string;
  anyOf?: IJSONSchema[];
  allOf?: IJSONSchema[];
  oneOf?: IJSONSchema[];
  not?: IJSONSchema;
  enum?: unknown[];
  format?: string;

  const?: unknown;
  contains?: IJSONSchema;
  propertyNames?: IJSONSchema;
  examples?: unknown[];

  $comment?: string;
  if?: IJSONSchema;
  then?: IJSONSchema;
  else?: IJSONSchema;

  unevaluatedProperties?: boolean | IJSONSchema;
  unevaluatedItems?: boolean | IJSONSchema;
  minContains?: number;
  maxContains?: number;
  deprecated?: boolean;
  dependentRequired?: { [property: string]: string[] };
  dependentSchemas?: IJSONSchemaMap;
  $defs?: { [name: string]: IJSONSchema };
  $anchor?: string;
  $recursiveRef?: string;
  $recursiveAnchor?: string;
  $vocabulary?: unknown;

  prefixItems?: IJSONSchema[];
  $dynamicRef?: string;
  $dynamicAnchor?: string;

  defaultSnippets?: IJSONSchemaSnippet[];
  errorMessage?: string;
  patternErrorMessage?: string;
  deprecationMessage?: string;
  markdownDeprecationMessage?: string;
  enumDescriptions?: string[];
  markdownEnumDescriptions?: string[];
  markdownDescription?: string;
  doNotSuggest?: boolean;
  suggestSortText?: string;
  allowComments?: boolean;
  allowTrailingCommas?: boolean;
  secret?: boolean;
}

export interface IJSONSchemaMap {
  [name: string]: IJSONSchema;
}

export interface IJSONSchemaSnippet {
  label?: string;
  description?: string;
  body?: unknown;
  bodyText?: string;
}

export type TypeFromJsonSchema<T> =
  T extends { enum: infer EnumValues }
    ? UnionOf<EnumValues>
    : T extends { type: "object"; properties: infer Properties; required: infer RequiredList }
      ? {
          [K in keyof Properties]: IsRequired<K, RequiredList> extends true
            ? TypeFromJsonSchema<Properties[K]>
            : TypeFromJsonSchema<Properties[K]> | undefined;
        } & AdditionalPropertiesType<T>
      : T extends { type: "object"; properties: infer Properties }
        ? { [K in keyof Properties]: TypeFromJsonSchema<Properties[K]> | undefined } & AdditionalPropertiesType<T>
        : T extends { type: "array"; items: infer Items }
          ? Items extends [...infer Rest]
            ? { [K in keyof Rest]: TypeFromJsonSchema<Items[K]> }
            : Array<TypeFromJsonSchema<Items>>
          : T extends { oneOf: infer Items }
            ? MapSchemaToType<Items>
            : T extends { anyOf: infer Items }
              ? MapSchemaToType<Items>
              : T extends { type: infer Type }
                ? Type extends "string" | "number" | "integer" | "boolean" | "null"
                  ? SchemaPrimitiveTypeNameToType<Type>
                  : Type extends [...infer Rest]
                    ? UnionOf<{ [K in keyof Rest]: SchemaPrimitiveTypeNameToType<Rest[K]> }>
                    : never
                : never;

type SchemaPrimitiveTypeNameToType<T> =
  T extends "string" ? string :
  T extends "number" | "integer" ? number :
  T extends "boolean" ? boolean :
  T extends "null" ? null :
  never;

type UnionOf<T> =
  T extends [infer First, ...infer Rest]
    ? First | UnionOf<Rest>
    : never;

type IsRequired<K, RequiredList> =
  RequiredList extends []
    ? false
    : RequiredList extends [K, ...infer _]
      ? true
      : RequiredList extends [infer _, ...infer Rest]
        ? IsRequired<K, Rest>
        : false;

type AdditionalPropertiesType<Schema> =
  Schema extends { additionalProperties: infer AdditionalProperties }
    ? AdditionalProperties extends false
      ? {}
      : { [key: string]: TypeFromJsonSchema<Schema["additionalProperties"]> }
    : {};

type MapSchemaToType<T> =
  T extends [infer First, ...infer Rest]
    ? TypeFromJsonSchema<First> | MapSchemaToType<Rest>
    : never;

type EqualSchemas = {
  schemas: IJSONSchema[];
  id?: string;
};

export function getCompressedContent(schema: IJSONSchema): string {
  let hasDuplicates = false;
  const equalsByString = new Map<string, EqualSchemas>();
  const nodeToEquals = new Map<IJSONSchema, EqualSchemas>();

  const visitSchemas = (next: IJSONSchema): boolean => {
    if (schema === next) {
      return true;
    }

    const value = JSON.stringify(next);
    if (value.length < 30) {
      return true;
    }

    const existing = equalsByString.get(value);
    if (!existing) {
      const equalSchemas = { schemas: [next] };
      equalsByString.set(value, equalSchemas);
      nodeToEquals.set(next, equalSchemas);
      return true;
    }

    existing.schemas.push(next);
    nodeToEquals.set(next, existing);
    hasDuplicates = true;
    return false;
  };

  traverseNodes(schema, visitSchemas);
  equalsByString.clear();

  if (!hasDuplicates) {
    return JSON.stringify(schema);
  }

  let definitionNodeName = "$defs";
  while (Object.prototype.hasOwnProperty.call(schema, definitionNodeName)) {
    definitionNodeName += "_";
  }

  const definitions: IJSONSchema[] = [];

  function stringify(root: IJSONSchema): string {
    return JSON.stringify(root, (_key: string, value: unknown) => {
      if (value !== root && isObject(value)) {
        const equalSchemas = nodeToEquals.get(value as IJSONSchema);
        if (equalSchemas && equalSchemas.schemas.length > 1) {
          if (!equalSchemas.id) {
            equalSchemas.id = `_${definitions.length}`;
            definitions.push(equalSchemas.schemas[0]);
          }

          return { $ref: `#/${definitionNodeName}/${equalSchemas.id}` };
        }
      }

      return value;
    });
  }

  const content = stringify(schema);
  const definitionStrings: string[] = [];

  for (let index = 0; index < definitions.length; index++) {
    definitionStrings.push(`"_${index}":${stringify(definitions[index])}`);
  }

  if (definitionStrings.length) {
    return `${content.substring(0, content.length - 1)},"${definitionNodeName}":{${definitionStrings.join(",")}}}`;
  }

  return content;
}

type IJSONSchemaRef = IJSONSchema | boolean;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function traverseNodes(root: IJSONSchema, visit: (schema: IJSONSchema) => boolean): void {
  if (!root || typeof root !== "object") {
    return;
  }

  const toWalk: IJSONSchema[] = [root];

  const collectEntries = (...entries: (IJSONSchemaRef | undefined)[]): void => {
    for (const entry of entries) {
      if (isObject(entry)) {
        toWalk.push(entry);
      }
    }
  };

  const collectMapEntries = (...maps: (IJSONSchemaMap | undefined)[]): void => {
    for (const map of maps) {
      if (isObject(map)) {
        for (const key in map) {
          const entry = map[key];
          if (isObject(entry)) {
            toWalk.push(entry);
          }
        }
      }
    }
  };

  const collectArrayEntries = (...arrays: (IJSONSchemaRef[] | undefined)[]): void => {
    for (const array of arrays) {
      if (Array.isArray(array)) {
        for (const entry of array) {
          if (isObject(entry)) {
            toWalk.push(entry);
          }
        }
      }
    }
  };

  const collectEntryOrArrayEntries = (items: IJSONSchemaRef[] | IJSONSchemaRef | undefined): void => {
    if (Array.isArray(items)) {
      for (const entry of items) {
        if (isObject(entry)) {
          toWalk.push(entry);
        }
      }
    } else if (isObject(items)) {
      toWalk.push(items);
    }
  };

  let next = toWalk.pop();
  while (next) {
    if (visit(next)) {
      collectEntries(
        next.additionalItems,
        next.additionalProperties,
        next.not,
        next.contains,
        next.propertyNames,
        next.if,
        next.then,
        next.else,
        next.unevaluatedItems,
        next.unevaluatedProperties,
      );
      collectMapEntries(
        next.definitions,
        next.$defs,
        next.properties,
        next.patternProperties,
        next.dependencies as IJSONSchemaMap | undefined,
        next.dependentSchemas,
      );
      collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.prefixItems);
      collectEntryOrArrayEntries(next.items);
    }

    next = toWalk.pop();
  }
}
