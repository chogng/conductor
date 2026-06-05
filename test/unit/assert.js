const formatValue = (value) => {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  return JSON.stringify(value);
};

const fail = (message) => {
  throw new Error(message);
};

const assert = {
  ok(value, message = "Expected value to be truthy.") {
    if (!value) {
      fail(message);
    }
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      fail(message ?? `Expected ${formatValue(actual)} to equal ${formatValue(expected)}.`);
    }
  },

  deepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      fail(message ?? `Expected ${actualJson} to deeply equal ${expectedJson}.`);
    }
  },

  match(value, regexp, message) {
    if (!regexp.test(value)) {
      fail(message ?? `Expected ${formatValue(value)} to match ${regexp}.`);
    }
  },
};

export default assert;
