$ErrorActionPreference = "Stop"

if ($env:GITHUB_REPOSITORY -eq "chogng/conductor-update") {
  throw "This workflow must run in the private source repository, not in chogng/conductor-update."
}
