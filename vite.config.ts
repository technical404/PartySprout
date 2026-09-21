import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const require = createRequire(import.meta.url);

function directoryApiPlugin() {
  const { handleApi } = require("./Database/api-handler.cjs") as {
    handleApi: (req: IncomingMessage, res: ServerResponse) => void;
  };
  const mount = (server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      return handleApi(req, res);
    });
  };
  return {
    name: "directory-api",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true },
  },
  vite: {
    plugins: [directoryApiPlugin()],
  },
});
