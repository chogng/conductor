import assert from "assert";

import { getCompressedContent, type IJSONSchema } from "../../common/jsonSchema.ts";

suite("base/test/common/jsonSchema", () => {
  test("getCompressedContent returns unchanged JSON when no duplicate schemas exist", () => {
    const schema: IJSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
      },
    };

    assert.equal(getCompressedContent(schema), JSON.stringify(schema));
  });

  test("getCompressedContent extracts duplicate schema nodes into defs", () => {
    const repeated: IJSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        value: { type: "number" },
      },
      required: ["name"],
    };
    const schema: IJSONSchema = {
      type: "object",
      properties: {
        first: repeated,
        second: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { type: "number" },
          },
          required: ["name"],
        },
      },
    };

    const compressed = JSON.parse(getCompressedContent(schema)) as IJSONSchema;

    assert.deepEqual(compressed.properties?.first, { $ref: "#/$defs/_0" });
    assert.deepEqual(compressed.properties?.second, { $ref: "#/$defs/_0" });
    assert.deepEqual(compressed.$defs?._0, repeated);
  });

  test("getCompressedContent avoids colliding with existing defs property", () => {
    const repeated: IJSONSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
    };
    const schema: IJSONSchema = {
      type: "object",
      $defs: {},
      properties: {
        first: repeated,
        second: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
      },
    };

    const compressed = JSON.parse(getCompressedContent(schema)) as IJSONSchema & {
      $defs_?: Record<string, IJSONSchema>;
    };

    assert.deepEqual(compressed.properties?.first, { $ref: "#/$defs_/_0" });
    assert.deepEqual(compressed.properties?.second, { $ref: "#/$defs_/_0" });
    assert.deepEqual(compressed.$defs_, { _0: repeated });
  });
});
