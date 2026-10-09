import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import "./styles.css";

function resolveConvexUrl(rawUrl: string | undefined): string {
  const cleaned = (rawUrl ?? "").trim().replace(/\/+$/, "");
  if (!cleaned) {
    return "https://prestigious-guanaco-645.convex.cloud";
  }
  // Automatically normalize .convex.site (HTTP Actions URL) to .convex.cloud (Deployment WebSocket/API URL)
  if (cleaned.endsWith(".convex.site")) {
    return cleaned.replace(/\.convex\.site$/, ".convex.cloud");
  }
  return cleaned;
}

const CONVEX_URL = resolveConvexUrl(import.meta.env.VITE_CONVEX_URL as string | undefined);

const convex = new ConvexReactClient(CONVEX_URL, {
  logger: false,
  skipConvexDeploymentUrlCheck: true,
  verbose: true,
});

createRoot(document.getElementById("root")!).render(
  <ConvexAuthProvider client={convex}>
    <App />
  </ConvexAuthProvider>
);
