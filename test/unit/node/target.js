import {
  prepareCompiledUnitTests,
  resolveCompiledUnitTests,
  runCompiledUnitTests,
} from "./compiledUnitTestRunner.js";

await prepareCompiledUnitTests();

const tests = resolveCompiledUnitTests(process.argv.slice(2));
const failures = await runCompiledUnitTests(tests);

process.exit(failures ? 1 : 0);
