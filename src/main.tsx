import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import "./styles.css";

const CONVEX_URL =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() ||
  "https://prestigious-guanaco-645.convex.cloud";

const convex = new ConvexReactClient(CONVEX_URL, {
  logger: false,
});

createRoot(document.getElementById("root")!).render(
  <ConvexAuthProvider client={convex}>
    <App />
  </ConvexAuthProvider>
);
