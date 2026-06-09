import path from "node:path";

import { app } from "electron";

import { configurePortable, getUserDataPath } from "./bootstrap-node.js";
import { product } from "./bootstrap-meta.js";

interface MainProcessArgs {
  readonly "user-data-dir"?: string;
}

function parseMainProcessArgs(argv: readonly string[]): MainProcessArgs {
  const args: { "user-data-dir"?: string } = {};

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--user-data-dir") {
      args["user-data-dir"] = argv[index + 1];
      index++;
    } else if (value.startsWith("--user-data-dir=")) {
      args["user-data-dir"] = value.slice("--user-data-dir=".length);
    }
  }

  return args;
}

const portable = configurePortable(product);
const args = parseMainProcessArgs(process.argv);
const userDataPath = getUserDataPath(args, product.nameShort);

app.setPath("userData", userDataPath);

if (portable.isPortable) {
  app.setAppLogsPath(path.join(userDataPath, "logs"));
}

app.once("ready", () => {
  void import("./cs/code/electron-main/main.js").catch(error => {
    console.error(error);
    app.exit(1);
  });
});
