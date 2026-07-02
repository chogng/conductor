# DataResource Semantic Rules

Automatic Review no longer consumes layout recipe catalogs. The active artifact
under this directory is the `v1/*.json` rule set, which is used by DataResource
evidence production to match column titles, row markers, and semantic domains.

The semantic rules store passive facts only:

- one domain or shared rule boundary per JSON file, such as `iv.json`,
  `cv.json`, `frequency.json`, or `transient.json`
- aliases for B1500 IV row markers such as `DataName` and `DataValue`
- aliases for titles such as `Vg`, `Vd`, `Id`, `Cgg`, `time`, and `frequency`
- built-in domain rules with explicit X and Y terms
- domain-owned X intent and role-priority profiles
- canonical role and unit hints
- axis tendency hints (`x`, `dependent`, or `unknown`)
- conservative measurement family/mode hints

DataResource combines these semantic matches with numeric evidence:

```txt
cell kind -> numeric runs -> title spans -> X ranges/groups
  -> data blocks -> dependent values -> binding candidates
```

Do not add layout taxonomy such as `simpleXY`, `sharedXMultiY`, or
`pairwiseXY` back into these rules. Review consumes the resulting
DataResource binding evidence directly.
