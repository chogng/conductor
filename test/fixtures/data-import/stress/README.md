# Data Import Stress Fixtures

This folder keeps stress fixture generation close to the root `test/fixtures`
tree without committing large generated files.

Generate local stress files:

```sh
node test/fixtures/data-import/stress/generate-stress-fixtures.mjs
```

Default output:

```txt
.build/bench/import-fixtures/
  csv/large-tall-200000x8.csv
  csv/wide-mixed-2000x256.csv
  xlsx/multi-sheet-3x5000x16.xlsx
  xls/legacy-large-5000x12.xls
```

The `.build/` output directory is intentionally git-ignored. Keep committed
fixtures small; use this generator for import throughput, memory, and workbook
multi-sheet stress checks.

