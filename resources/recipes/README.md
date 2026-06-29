# DataResource Semantic Library

Automatic Review no longer consumes layout recipe catalogs. The active artifact
under this directory is `v1/semantic-library.json`, which is used by
DataResource evidence production to match column titles and row markers.

The semantic library stores passive facts only:

- aliases for row markers such as `DataName` and `DataValue`
- aliases for titles such as `Vg`, `Vd`, `Id`, `Cgg`, `time`, and `frequency`
- canonical role and unit hints
- axis tendency hints (`x`, `dependent`, or `unknown`)
- conservative measurement family/mode hints

DataResource combines these semantic matches with numeric evidence:

```txt
cell kind -> numeric runs -> title spans -> X ranges/groups
  -> data blocks -> dependent values -> binding candidates
```

Do not add layout taxonomy such as `simpleXY`, `sharedXMultiY`, or
`pairwiseXY` back into this library. Review consumes the resulting
DataResource binding evidence directly.
