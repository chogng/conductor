const BrowserWorkbenchRoot = "/src/cs/code/browser/workbench";

export function getBrowserWorkbenchPath(isBuilt: boolean): string {
  return `${BrowserWorkbenchRoot}/workbench${isBuilt ? "" : "-dev"}.html`;
}

export function getBrowserWorkbenchUrl(origin: string, isBuilt: boolean): string {
  return new URL(getBrowserWorkbenchPath(isBuilt), origin).toString();
}

export function shouldRouteToBrowserWorkbench(pathname: string): boolean {
  return pathname === "/" ||
    pathname === `${BrowserWorkbenchRoot}/workbench.html` ||
    pathname === `${BrowserWorkbenchRoot}/workbench-dev.html`;
}
