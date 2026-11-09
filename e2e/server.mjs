// ABOUTME: Minimal static file server for the Playwright suite: serves dist/ with the 404 page,
// ABOUTME: redirecting /page to /page/ for directories as GitHub Pages does.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize } from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

async function isDirectory(file) {
  try {
    return (await stat(file)).isDirectory();
  } catch {
    return false;
  }
}

// Stays in the foreground so Playwright's webServer can manage its lifetime.
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let path = normalize(url.pathname).replaceAll("..", "");
  if (path.endsWith("/")) {
    path = join(path, "index.html");
  } else if (await isDirectory(join(root, path))) {
    response.writeHead(301, { location: `${path}/${url.search}` });
    response.end();
    return;
  }
  try {
    const body = await readFile(join(root, path));
    response.writeHead(200, {
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/html" });
    response.end(await readFile(join(root, "404.html")));
  }
});
server.listen(4321, "127.0.0.1");
