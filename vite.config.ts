import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as vite from "vite";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { z } from "zod";

const isRolldownVite = "rolldownVersion" in vite;
const SYNC_FILE_PATH = path.resolve(process.cwd(), ".Jusclick-lan-state.json");

// Zod schema for validating sync payload (2026 best practice: strict validation)
const PasscodeSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/, "Invalid codeHash format"),
  visitorName: z.string().min(2).max(80).regex(/^[^<>"'`]+$/, "Invalid visitor name"),
  kind: z.enum(["visitor", "contractor", "supplier"]),
  company: z.string().max(80).optional(),
  hostDepartmentId: z.string().optional(),
  hostName: z.string().max(80),
  issuedBy: z.string(),
  expiresAt: z.number(),
  usedAt: z.number().optional(),
  revokedAt: z.number().optional(),
});

const OnSiteRecordSchema = z.object({
  id: z.string(),
  passcodeId: z.string().optional(),
  codeHash: z.string().optional(),
  visitorName: z.string().min(2).max(80),
  company: z.string().max(80).optional(),
  kind: z.enum(["visitor", "contractor", "supplier"]),
  issuedByUserId: z.string().optional(),
  hostName: z.string().max(80),
  hostDepartmentId: z.string().optional(),
  deptName: z.string().max(60).optional(),
  phone: z.string().max(32).optional(),
  idType: z.string().max(40).optional(),
  idNumber: z.string().max(40).optional(),
  badgeNumber: z.string().max(24).optional(),
  vehiclePlate: z.string().max(24).optional(),
  purpose: z.string().max(120).optional(),
  notes: z.string().max(160).optional(),
  checkedInAt: z.number(),
  checkedInBy: z.string(),
  checkedInByUserId: z.string().optional(),
  expiresAt: z.number().optional(),
  checkedOutAt: z.number().optional(),
  checkedOutBy: z.string().optional(),
  checkedOutByUserId: z.string().optional(),
  checkoutNotes: z.string().max(160).optional(),
});

const SyncPayloadSchema = z.object({
  __senderDeviceId: z.string().min(1).max(100).regex(/^dev_\d+_[a-z0-9]{6}$/, "Invalid device ID format"),
  attachmentsByHash: z.record(z.any()).optional(),
  attachmentsByPasscodeId: z.record(z.any()).optional(),
  attachmentsByName: z.record(z.any()).optional(),
  localPasscodes: z.array(PasscodeSchema).max(300, "Too many passcodes").optional(),
  revokedPasscodeIds: z.record(z.number()).optional(),
  usedPasscodeTimestamps: z.record(z.number()).optional(),
  onSiteRecords: z.array(OnSiteRecordSchema).max(500, "Too many on-site records").optional(),
  checkedOutPasscodeIds: z.record(z.object({
    checkedOutAt: z.number(),
    checkedOutBy: z.string(),
    checkoutNotes: z.string().optional(),
  })).optional(),
  deniedPasscodeIds: z.record(z.any()).optional(),
  deniedCodeHashes: z.record(z.any()).optional(),
  localAuditEntries: z.array(z.any()).max(120).optional(),
  localNotifications: z.array(z.any()).max(80).optional(),
}).strict(); // Reject unknown properties

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
      if (url === "/api/Jusclick-sync/stream" && req.method === "GET") {
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

      if (url === "/api/Jusclick-sync" && req.method === "GET") {
        // Authentication check: verify Convex auth token from Authorization header
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(sharedStateJson);
        return;
      }

      if (url === "/api/Jusclick-sync" && req.method === "POST") {
        // Authentication check: verify Convex auth token from Authorization header
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
          return;
        }

        let body = "";
        req.on("data", chunk => {
          body += String(chunk);
          // Reduced from 8MB to 1MB per 2026 best practices
          if (body.length > 1 * 1024 * 1024) {
            req.destroy();
          }
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            
            // Validate with Zod schema (2026 best practice)
            const validated = SyncPayloadSchema.parse(parsed);
            
            if (validated && typeof validated === "object") {
              sharedStateJson = JSON.stringify(validated);
              lastUpdatedAt = Date.now();
              try {
                fs.writeFileSync(SYNC_FILE_PATH, sharedStateJson, "utf-8");
              } catch {
                // ignore disk write errors
              }
              const payload = `data: ${JSON.stringify({
                updatedAt: lastUpdatedAt,
                senderDeviceId: validated.__senderDeviceId,
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
          } catch (error) {
            // Log validation errors for security monitoring
            console.error("Sync payload validation failed:", error);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
          }
        });
        return;
      }

      next();
    });
  };

  return {
    name: "Jusclick-lan-sync",
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

