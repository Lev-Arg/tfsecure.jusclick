import * as vite from "vite";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

const isRolldownVite = "rolldownVersion" in vite;

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
  plugins: createCleanReactPlugins(),
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
  },
});

