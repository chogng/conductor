import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const host = "127.0.0.1";
const port = 43117;
const filePath = path.resolve(process.cwd(), ".tmp", "icon-render.html");

const server = http.createServer((request, response) => {
  if (request.url !== "/" && request.url !== "/icon-render.html") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const html = fs.readFileSync(filePath, "utf8");
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
});

server.listen(port, host, () => {
  process.stdout.write(`http://${host}:${port}\n`);
});
