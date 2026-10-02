import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as vite from "vite";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

const isRolldownVite = "rolldownVersion" in vite;
const SYNC_FILE_PATH = path.resolve(process.cwd(), ".tfsecure-lan-state.json");

function createLanSyncPlugin(): Plugin {
  let sharedStateJson = "{}";
  let lastUpdatedAt = 0;
  try {
    if (fs.existsSync(SYNC_FILE_PATH)) {
      sharedStateJson = fs.readFileSync(SYNC_FILE_PATH, "utf-8") || "{}";
      lastUpdatedAt = Date.now();
    }
  } catch {
    // ignore initial read errors
  }

  const sseClients = new Set<ServerResponse>();

  const attachMiddleware = (middlewares: {
    use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
  }) => {
    middlewares.use((req, res, next) => {
      const url = req.url?.split("?")[0] ?? "";
      if (url === "/api/tfsecure-sync/stream" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(`data: ${JSON.stringify({ updatedAt: lastUpdatedAt })}\n\n`);
        sseClients.add(res);
        req.on("close", () => {
          sseClients.delete(res);
        });
        return;
      }

      if (url === "/api/tfsecure-sync" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(sharedStateJson);
        return;
      }

      if (url === "/api/tfsecure-sync" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => {
          body += String(chunk);
          if (body.length > 8 * 1024 * 1024) {
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === "object") {
              sharedStateJson = body;
              lastUpdatedAt = Date.now();
              try {
                fs.writeFileSync(SYNC_FILE_PATH, sharedStateJson, "utf-8");
              } catch {
                // ignore disk write errors
              }
              const payload = `data: ${JSON.stringify({
                updatedAt: lastUpdatedAt,
                senderDeviceId: parsed.__senderDeviceId,
              })}\n\n`;
              for (const client of sseClients) {
                try {
                  client.write(payload);
                } catch {
                  sseClients.delete(client);
                }
              }
            }
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            res.end(JSON.stringify({ ok: true, updatedAt: lastUpdatedAt }));
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          }
        });
        return;
      }

      next();
    });
  };

  return {
    name: "tfsecure-lan-sync",
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

function createCleanReactPlugins(): PluginOption[] {
  const rawPlugins = react({
    // @ts-expect-error supported at runtime in @vitejs/plugin-react
    disableOxcRecommendation: true,
  });
  const list = Array.isArray(rawPlugins) ? rawPlugins : [rawPlugins];
  return list.map(plugin => {
    if (
      isRolldownVite &&
      plugin &&
      typeof plugin === "object" &&
      "name" in plugin &&
      plugin.name === "vite:react-babel"
    ) {
      const patched = {
        ...plugin,
        config() {
          return {
            oxc: {
              jsx: {
                runtime: "automatic" as const,
              },
            },
          };
        },
      };
      delete (patched as Record<string, unknown>).options;
      return patched;
    }
    return plugin;
  });
}

export default defineConfig({
  plugins: [...createCleanReactPlugins(), createLanSyncPlugin()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
  },
});

