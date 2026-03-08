const { assertOriginExePath } = require("./core.cjs");

async function pickOriginExecutable({
  dialog,
  ownerWindow,
  defaultPath,
}) {
  const result = await dialog.showOpenDialog(ownerWindow || undefined, {
    title: "Select Origin executable",
    defaultPath: defaultPath || undefined,
    properties: ["openFile"],
    filters: [
      { name: "Origin executable", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return assertOriginExePath(result.filePaths[0]);
}

module.exports = {
  pickOriginExecutable,
};
