# Origin Capabilities v1 Schema

This document describes the strict payload schema accepted by `device-analysis-origin:run-csv` for `capabilities`.

## Root

Allowed root keys:

- `import`
- `plot`
- `graph`
- `style`
- `axis`
- `commands`
- `preCommands`
- `postCommands`

Type rules:

- Section keys (`import`, `plot`, `graph`, `style`, `axis`, `commands`) must be objects.
- `preCommands` / `postCommands` can be:
  - string (multiline supported), or
  - string array

Unknown root keys are rejected.

## import section

Allowed keys:

- `workbookLongName` (string)
- `longName` (string, alias of `workbookLongName`)
- `preCommands` (string | string[])
- `beforeCommands` (string | string[], alias of `preCommands`)
- `postCommands` (string | string[])
- `afterCommands` (string | string[], alias of `postCommands`)

## plot section

Allowed keys:

- `command` (string)
- `plotCommand` (string, alias of `command`)
- `preCommands` (string | string[])
- `beforeCommands` (string | string[], alias of `preCommands`)
- `postCommands` (string | string[])
- `afterCommands` (string | string[], alias of `postCommands`)
- `postPlotCommands` (string | string[], alias of `postCommands`)

## graph section

Allowed keys:

- `preCommands` (string | string[])
- `beforeCommands` (string | string[], alias of `preCommands`)
- `postCommands` (string | string[])
- `afterCommands` (string | string[], alias of `postCommands`)

## style section

Allowed keys:

- `commands` (string | string[])
- `postCommands` (string | string[], alias of `commands`)

## axis section

Allowed keys:

- `commands` (string | string[])
- `postCommands` (string | string[], alias of `commands`)

## commands section

Allowed keys:

- `preCommands` (string | string[])
- `beforeCommands` (string | string[], alias of `preCommands`)
- `postCommands` (string | string[])
- `afterCommands` (string | string[], alias of `postCommands`)

## Example

```json
{
  "import": {
    "workbookLongName": "Transfer Curve",
    "preCommands": ["sec -p 0;"]
  },
  "plot": {
    "command": "plotxy iy:=((1,2)) plot:=202;",
    "postCommands": ["rescale;"]
  },
  "style": {
    "commands": ["set %C -c color(Blue);"]
  },
  "axis": {
    "commands": ["label -xb \"Vg (V)\";", "label -yl \"Id (A)\";"]
  },
  "commands": {
    "postCommands": ["win -a;"]
  }
}
```

## Validation behavior

- Any unknown key is rejected.
- Any non-string command item in an array is rejected.
- Any wrong section type (e.g. array instead of object) is rejected.
- Validation runs in both Electron main process and Python worker.
