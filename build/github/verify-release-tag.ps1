param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = "Stop"

$env:TAG = $Tag
node --input-type=module -e "import fs from 'node:fs'; const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); const expected='v'+String(pkg.version||'').trim(); const tag=String(process.env.TAG||'').trim(); if (!tag) { console.error('Missing tag'); process.exit(1); } if (tag!==expected) { console.error('Tag/version mismatch: tag='+tag+' expected='+expected); process.exit(1); } console.log('OK: '+tag+' matches package.json version '+pkg.version);"
